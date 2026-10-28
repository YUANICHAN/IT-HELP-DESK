# Step 10: background delivery

The API writes one outbox document per domain event, recipient, and channel in
the same MongoDB transaction as the business record, timeline, and audit event.
An outbox row means **queued**, not delivered. The separate worker currently
delivers the essential `IN_APP` channel. Email rows are intentionally
`SUPPRESSED` with `EMAIL_DELIVERY_DISABLED`; no SMTP adapter is required.

MongoDB must be a replica set. The API does not fall back to partial business
writes, and the worker does not fall back to a non-transactional notification
insert/completion pair.

For a local single-node `rs0`, follow the Windows setup in
[Authentication](AUTHENTICATION.md#mongodb-transaction-prerequisite), including the
one-time `rs.initiate(...)`, and use a URI such as
`mongodb://127.0.0.1:27017/it_help_desk?replicaSet=rs0`. Appending the URI option
alone does not convert a standalone server into a replica set.

## Configuration

Add these values to `backend/.env` as appropriate for the environment:

```dotenv
APPLICATION_RELEASE=development
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_BATCH_SIZE=20
OUTBOX_CONCURRENCY=4
OUTBOX_LEASE_SECONDS=60
WORKER_HEARTBEAT_INTERVAL_SECONDS=10
WORKER_STALE_SECONDS=30
CLEANUP_INTERVAL_SECONDS=300
CLEANUP_BATCH_SIZE=100
CLEANUP_ABANDONED_UPLOAD_MINUTES=60
IDEMPOTENCY_RETENTION_HOURS=24
```

The retention and cleanup values are configurable project defaults, not a
production retention recommendation. Activation/reset tokens and exports do
not exist in this backend yet, so cleanup reports them as `NOT_IMPLEMENTED`
instead of inventing records or retention policies.

Run the index migration before starting the updated processes. In two
PowerShell windows from `backend`:

```powershell
npm ci
npm run db:indexes
npm start
```

```powershell
Set-Location C:\path\to\IT_HELP_DESK\backend
npm run worker
```

Development can use `npm run worker:dev`, which uses Node's built-in watch
mode. The worker combines outbox delivery, the existing SLA evaluator, bounded
cleanup, and heartbeat updates; it does not create a competing SLA scheduler.

## Delivery and retry rules

Claims use an atomic `findOneAndUpdate`, a random lease token, and an expiry.
Only the matching, unexpired token may complete or fail the claim. A crashed
claim becomes eligible after its lease expires. The notification insert and
outbox `DELIVERED` update commit in one transaction, and the notification's
unique outbox reference prevents duplicate in-app rows.

`attempts` increments when a claim starts, including a recovered expired
claim. Temporary failures after attempts 1 through 4 are retried after 1, 5,
15, and 60 minutes. Failure on attempt 5 becomes `FAILED`. Permission denial is
`SUPPRESSED`, not failed. Stored diagnostics are allowlisted codes and never
contain exception text, cookies, tokens, hashes, credentials, or message bodies.

Every delivery reloads the active recipient, organization, grants, and linked
resource access. Ticket descriptions, note text, attachment contents, and
credentials are never copied into the outbox or notification. Revoked scopes
and disabled accounts suppress pending delivery. Notification links still use
normal protected API routes and do not confer access.

## Notification API

Both endpoints require the host-only session cookie. The mutation also needs
the session-bound CSRF token and an allowed `Origin`.

```powershell
$Base = 'http://127.0.0.1:5000/api/v1'
$Web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Login = Invoke-RestMethod -Method Post -Uri "$Base/auth/login" `
  -WebSession $Web -ContentType 'application/json' `
  -Headers @{ Origin = 'http://127.0.0.1:5000' } `
  -Body (@{ email = 'employee@example.com'; password = $env:HELP_DESK_PASSWORD } | ConvertTo-Json)

Invoke-RestMethod -Method Get -Uri "$Base/notifications?state=unread&page=1&limit=25" `
  -WebSession $Web

$NotificationId = '<notification-id>'
Invoke-RestMethod -Method Post -Uri "$Base/notifications/$NotificationId/read" `
  -WebSession $Web -ContentType 'application/json' `
  -Headers @{ Origin = 'http://127.0.0.1:5000'; 'X-CSRF-Token' = $Login.data.csrfToken } `
  -Body '{}'
```

`state` accepts `all`, `read`, or `unread`; the default limit is 25 and the
maximum is 100. Unread totals and list rows use the same current-access check.
Reading is idempotent. Another user's or newly inaccessible notification is
reported as 404.

Administrators can inspect worker delivery health without seeing content:

```powershell
Invoke-RestMethod -Method Get -Uri "$Base/admin/health" -WebSession $Web
```

The response contains heartbeat freshness, pending/failed counts, the oldest
pending age, expired leases, safe error-code summaries, and cleanup status. A
stale worker makes the result `degraded`. Public `GET /api/v1/health` remains
unchanged.

## Restart recovery demonstration

1. Start the API and worker, then perform a ticket action that has recipients.
2. Stop the worker process. If it stopped after claiming, the outbox row remains
   `PROCESSING` with a lease expiry; if it stopped earlier, it remains `PENDING`.
3. Wait longer than `OUTBOX_LEASE_SECONDS`, then run `npm run worker` again.
4. In Compass, inspect `outboxevents` and `notifications`. The row becomes
   `DELIVERED`, and exactly one notification has that outbox `_id`.

An older worker cannot finalize after a newer lease is issued. Unexpected
termination is recovered by lease expiry; graceful shutdown stops new claims
and waits for active batches.

## Indexes

`npm run db:indexes` creates or verifies:

- unique outbox `{ organization, deduplicationKey }`;
- outbox claim and organization-health indexes;
- unique notification `{ outbox }` plus recipient timeline/read indexes;
- unique heartbeat `{ workerId }` and freshness index;
- unique maintenance job `{ name }` and claim index;
- explicit `expiresAt` TTL for idempotency records.

The migration expands deliverable legacy selector-style pending outbox rows
into per-recipient rows and suppresses the legacy selector row. It also
backfills explicit idempotency expiry and removes the obsolete fixed TTL index.

## Current limitations

- Email delivery is not implemented. Future email delivery will be at-least-once;
  exactly-once SMTP delivery cannot be claimed.
- There are no activation tokens, password-reset tokens, or export records yet.
- Notification screens and extended delivery reports are frontend/future work.
- The notification list reauthorizes each candidate to keep counts consistent;
  very large inboxes may need a denormalized authorization projection later.
