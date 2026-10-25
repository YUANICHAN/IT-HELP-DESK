# Step 9: complete SLA behavior

This backend measures SLA time from stored UTC instants using each ticket's
snapshotted IANA timezone, weekly windows, and full-day holidays. MongoDB must
run as a replica set because ticket transitions, SLA state, breach history,
audit records, and pending outbox records commit in transactions.

## Clock conventions

- Business windows and measured intervals are half-open: `[start, end)`.
- Completion exactly at the calculated deadline meets the target. A metric is
  breached only after that instant.
- Weekly windows may be adjacent but may not overlap. Overnight windows are not
  accepted; split them at midnight. Full-day holidays use local `YYYY-MM-DD`.
- The default calendar is `Asia/Manila`, Monday through Friday, with
  `08:00-12:00` and `13:00-17:00` windows.
- UTC instants are converted to the snapshotted timezone for calendar lookup.
  On a DST fall-back overlap, both occurrences inside a configured window count.
  A configured boundary in a spring-forward gap moves to the first valid local
  minute after the gap.
- Resolution pauses subtract only their intersections with business windows.
  Lunch, holidays, and weekends are therefore never subtracted twice.
- The three-business-day reopening rule uses the third subsequent scheduled
  business date at the same local wall time, not 72 elapsed hours.

The reusable functions are in `src/modules/service-levels/businessTime.js`:
`businessMilliseconds`, `addBusinessMilliseconds`,
`pauseBusinessMilliseconds`, `addBusinessMillisecondsWithPauses`, and
`reopenDeadline`.

## Defaults and immutable history

New policies fill omitted targets with these configurable project defaults:

| Priority | First response | Resolution |
| --- | ---: | ---: |
| P1 | 1,800 seconds | 14,400 seconds |
| P2 | 7,200 seconds | 28,800 seconds |
| P3 | 14,400 seconds | 86,400 seconds |
| P4 | 28,800 seconds | 144,000 seconds |

These are project defaults, not organizational commitments. A ticket stores a
complete service, policy, and calendar snapshot, including policy/calendar IDs
and revisions. New configuration affects later submissions only. Reopened
cycles reuse the ticket's original snapshot. Historical snapshots are never
rewritten by the index migration.

Records missing enough historical configuration to calculate a result return
`reconciliationRequired` with `SLA_RECONCILIATION_REQUIRED` semantics. The
service does not invent targets, windows, revisions, or holidays.

## Response and resolution behavior

The response clock begins at cycle submission/reopening and never pauses.
Only a public human response by a currently authorized assigned technician or
triage supervisor completes it. Requester replies, internal notes, approval
events, assignment, and automated activity do not count. A public resolution
summary counts when no earlier qualifying response exists.

The resolution clock starts with the cycle and pauses for `WAITING_APPROVAL`
and `WAITING_REQUESTER`. `WAITING_VENDOR` continues to consume business time.
Pause records store start/end instants, reason, and actors. Database constraints
and conditional writes permit one open pause and one unfinished cycle per
ticket. Resolution, cancellation, and rejection retain elapsed history;
cancelled/rejected cycles are marked ineligible for resolution attainment.

Triage priority changes use the original policy snapshot. They preserve elapsed
time and completed response measurements, retain prior breaches, record the
old/new targets and reason, and immediately evaluate smaller budgets.

## Breach worker

Configure the evaluator in `.env`:

```dotenv
SLA_EVALUATION_INTERVAL_SECONDS=60
SLA_EVALUATION_BATCH_SIZE=200
```

From `backend`, apply additive backfills/indexes once after upgrading, then run
the API and worker in separate PowerShell windows:

```powershell
npm ci
npm run db:indexes
npm start
```

```powershell
Set-Location C:\path\to\IT_HELP_DESK\backend
npm run worker
```

For worker development with Node's built-in watch mode:

```powershell
npm run worker:dev
```

The worker evaluates immediately at startup and then at the configured interval.
It recomputes from cycle timestamps, snapshots, and pause history, so downtime
does not restart a clock. Cached due times only select candidates. A clock
revision coordinates the worker with pauses, completion, and reprioritization.
The unique `{ organization, cycle, metric }` breach index and transactional
writes prevent duplicate breach history and notifications across workers.

Each breach transaction stores the breach, a safe ticket event, an audit event,
and a PENDING outbox record. It never reports notification delivery. The outbox
selects currently authorized triage recipients at delivery and includes an
assigned technician only while that technician remains active and support
scoped.

## API

`GET /api/v1/tickets/:ticketId/service-level` requires the normal session cookie
but no CSRF header because it is read-only. It returns `Cache-Control: no-store`.

```powershell
$Base = 'http://127.0.0.1:5000/api/v1'
$Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Login = Invoke-RestMethod -Method Post -Uri "$Base/auth/login" `
  -WebSession $Session -ContentType 'application/json' `
  -Headers @{ Origin = 'http://127.0.0.1:5000' } `
  -Body (@{ email = 'employee@example.com'; password = $env:HELP_DESK_PASSWORD } | ConvertTo-Json)

$TicketId = '<ticket-id>'
Invoke-RestMethod -Method Get -Uri "$Base/tickets/$TicketId/service-level" `
  -WebSession $Session
```

Requesters and department supervisors receive aggregate public metrics and only
whether the current cycle is paused. Current authorized support/triage staff
also receive cycle history, pause reasons/actors, priority changes, and breach
history. Inaccessible tickets return 404. Administrator role alone adds no
ticket access.

## Required indexes and migration

`npm run db:indexes` creates or verifies:

- one unique cycle number per organization/ticket;
- one unfinished cycle per organization/ticket using `isOpen: true`;
- one open resolution pause per organization/ticket/cycle;
- one breach per organization/cycle/metric;
- evaluator candidate and breach-history lookup indexes.

The migration converts legacy live policy minute targets to seconds and adds
live policy/calendar revisions plus cycle coordination fields. It deliberately
does not alter historical ticket snapshots. Resolve duplicate/open-cycle data
before rerunning if MongoDB reports an index conflict.

## Current limitations

- Full-day holidays are supported; partial-day holiday exceptions and overnight
  windows require a future calendar-format extension.
- This stage writes pending notifications but does not implement external email,
  push, or outbox delivery.
- Frontend SLA pages and extended SLA reporting are outside Step 9.
- Incomplete historical snapshots require an explicit reconciliation process;
  no automatic historical inference is performed.
