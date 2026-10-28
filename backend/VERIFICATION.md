# Verification record

## Step 11 - 2026-10-28

Validated on Windows PowerShell with Node.js v24 and MongoDB 8.2 using an
isolated single-node replica set `rs-step11` on `127.0.0.1:27018`. UUID-named
test databases were created and dropped; the normal standalone instance on port
27017 was not modified.

```powershell
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/?replicaSet=rs-step11'
npm test
```

Latest full run: **94 passed, 0 failed, 0 skipped, 89.59 seconds.** This includes
all authentication, access, ticket, approval, attachment, asset, SLA, outbox,
cleanup, and notification regressions plus the Step 11 suite.

After the final audit filter-combination and invalid-storage-configuration
hardening, the focused Step 11 suite was rerun: **6 passed, 0 failed, 8.97
seconds.**

The Step 11 suite independently verifies role-specific totals, another
technician's inaccessible assignment, overlapping-grant deduplication, immediate
revocation, immutable original department ownership after transfer,
administrator non-bypass, resolved/backlog separation, three of four eligible
cycles producing exactly 75% attainment, cancelled/rejected exclusions,
reopening events versus distinct tickets, business-second units, audit filter
validation/redaction, missing/malformed/stale backup evidence, inaccessible
storage, and administrator-only health.

Expected injected persistence errors appear in the full output. Their existing
tests assert transaction rollback; they are passing behavior. The synthetic
backup manifest tests do not perform a real backup or restore, and Postman was
not run. See [Summaries and operations](SUMMARIES_OPERATIONS.md).

Additional checks on the same isolated replica set:

- `node --check` succeeded for all 144 JavaScript files under `src`, `scripts`,
  and `test`; `git -c core.safecrlf=false diff --check` had no errors.
- `npm run db:indexes` completed on a disposable database. Inspection confirmed
  the ticket, SLA-cycle, ticket-event, worklog, asset-event, and audit-explorer
  reporting indexes by name.
- `npm run worker` used a dedicated empty storage root, recorded successful
  delivery/SLA/cleanup runs, and persisted `STOPPED` after SIGINT.

## Step 10 - 2026-10-28

Validated on Windows PowerShell with Node.js v24.19.0, npm 11.6.4, and
MongoDB 8.2.3 using an isolated replica set named `step67` on
`127.0.0.1:27019`. The normal MongoDB instance on port 27017 and its databases
were not modified.

```powershell
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27019/it_help_desk_test?replicaSet=step67'
npm test
```

Latest complete run: **88 passed, 0 failed, 0 skipped, 96.02 seconds.** This
includes all prior authentication, scope, ticket, approval, attachment, asset,
and SLA tests plus the 10-result Step 10 suite.

Step 10 coverage includes stable enqueue deduplication and distinct domain
events; two-worker contention; expired-lease crash recovery; rejection of an
old lease token; transactional notification/outbox rollback; persisted 1/5/15/
60-minute retries and five-attempt exhaustion; account-disable and grant-revoke
suppression; notification ownership/current-access/CSRF checks; internal-title
non-disclosure; bounded session/idempotency cleanup with ticket history
preserved; and stale-heartbeat/failed-delivery health reporting.

Also verified:

- `node --check` succeeded for all 130 JavaScript files under `src`, `scripts`,
  and `test`; `git diff --check` reported no whitespace errors.
- `npm run db:indexes` completed on an isolated Step 10 database and created the
  outbox, notification, heartbeat, maintenance, and explicit-expiry indexes.
- `node src/worker.js` connected to the isolated replica set, ran the immediate
  delivery/SLA/cleanup schedule, logged its worker identity, and handled SIGINT
  with the heartbeat moving through graceful shutdown.
- After the final lease-expiry and unassigned-support recipient adjustments,
  the focused Step 10 and ticket suites were rerun: **20 passed, 0 failed**.
- The standalone port-27017 check still fails closed for transactional writes,
  as designed; all transaction success/rollback checks used port 27019.

Expected injected audit, outbox, and finalization errors appear in test output.
Their tests assert rollback and are passing behavior. See
[Background delivery](BACKGROUND_DELIVERY.md).

## Step 9 - 2026-10-25

Validated on Windows PowerShell with Node.js v24.19.0, npm 11.6.4, and
MongoDB 8.2.3 using an isolated replica set named `step9` on
`127.0.0.1:27019`.

```powershell
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27019/it_help_desk_test?replicaSet=step9'
node --test --test-force-exit --test-isolation=none --test-concurrency=1 test/*.test.js
```

Latest full run: **78 passed, 0 failed, 0 skipped, 66.11 seconds.** It includes
all authentication, access, approval, ticket, attachment, and asset regressions,
the deterministic business-time cases, and the Step 9 replica-set suite.

Step 9 coverage includes exact deadline boundaries; lunch, weekend, holiday,
timezone, and DST calculations; concurrent breach evaluators; restart recovery;
unique breach/event/audit/outbox artifacts; injected transaction rollback;
requester-safe and staff service-level views; administrator denial; live scope
revocation; requester and vendor waiting; configuration snapshot immutability;
priority decreases and retained breach history; and reopening into a new cycle
with the original configuration.

Also verified:

- `node --check` succeeded for all 112 JavaScript files under `src`, `scripts`,
  and `test`, and `git diff --check` reported no whitespace errors.
- `npm run db:indexes` succeeded on an isolated database. Inspection confirmed
  the unique unfinished-cycle, open-pause, and organization/cycle/metric breach
  indexes plus evaluator/history lookup indexes.
- `npm run worker` connected to the isolated replica set, ran its immediate
  evaluation, logged `SLA worker running.`, and handled SIGINT shutdown.

Expected injected persistence failures appear in the full test output. Their
tests assert transaction rollback and are passing behavior, not unresolved test
failures. See [SLA behavior and operations](SLA_BEHAVIOR.md).

## Step 8 — 2026-10-25

Validated on Windows PowerShell 5.1, Node.js v24.16.0, MongoDB 9.0, using the
isolated `step67` replica set at `127.0.0.1:27019`. The existing port 27017
instance was not reconfigured. Each test fixture creates and drops a UUID-named
database.

```powershell
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27019/it_help_desk_test?replicaSet=step67'
npm test
```

**Latest full run: 70 passed, 0 failed, 0 skipped, 72.34 seconds.** This includes
the existing 53 tests and 17 new approval test results (15 integration subtests,
their parent test, and one deterministic SLA clock test).

Covered approval behavior:

- Configured primary and backup selection, self exclusion, missing/foreign/
  inactive/out-of-scope candidates, configuration-error recovery using the same
  idempotency key, no partial records/counter increments, and incident rejection.
- Named approver authorization, administrator limitations, public-only response
  fields, history permissions, internal notes/attachments excluded, validated
  query filters and authorization before pagination/counts.
- Approval/rejection states, mandatory rejection explanations, original policy
  snapshots, preserved SLA starts, resolution-only pauses, response clocks,
  rejection exclusion from attainment, and an approved request's complete
  claim/start/resolve/reopen/resolve/close journey.
- Reroute permission and candidate checks, prior rounds preserved, old approver
  loses decision authority, settings do not silently change pending approvers,
  cancellation supersedes pending rounds, and terminal guards remain intact.
- Revocation affects existing sessions, inactive accounts cannot decide,
  completed-command retries reauthorize, changed-input keys fail, and exact
  concurrent creation/decision/reroute retries write one result.
- Four repeated approve/reject/reroute/cancel races with one winner per ticket;
  actual pending-round and round-number unique indexes; stale versions;
  same-organization/model self-approval constraints.
- Every fulfillment command and automatic requester-reply resumption rejects
  a forged APPROVED status flag without an approved persisted current round,
  even after the catalog requirement changes.
- Injected audit AND outbox failures during creation, approval, rejection,
  rerouting and cancellation roll back business/history/pause/idempotency writes.
  Expected 500 exceptions are intentionally present in the test log.
- Existing cookie, session, CSRF, origin, health, scope, ticket, asset and protected
  attachment regression tests continue to pass.

Also executed successfully:

- `npm run seed:approvals` twice on `it_help_desk_demo_step8`; IDs stayed the same.
- `npm run db:indexes` on that isolated database; all actual indexes were created.
- `examples/approvals.ps1` against the synthetic API on port 5001: submission and
  retry, inbox, approval, rejection, reroute, backup approval, self-primary fallback,
  fallback failure (`409 APPROVER_CONFIGURATION_REQUIRED`), and health `ok`.
- `git -c core.safecrlf=false diff --check` with no whitespace errors.
- New JavaScript files formatted with installed Babel tooling, with before/after
  AST equality verified. No new runtime dependencies were installed.

The first approval run exposed fixture assumptions about immutable grants and
revoked inactive-user sessions; those fixtures were corrected. A later concurrent
reroute retry test exposed validation occurring before the stale-version check;
the service now checks versions first and the complete suite passes.

Postman examples are documented in [APPROVALS.md](APPROVALS.md); they were not
executed in Postman. External notification delivery and provisioning were not
tested or implemented; committed notifications remain PENDING for a future worker.

## Steps 6 and 7 baseline — 2026-10-24

Validated on Windows, 2026-10-24, using Node.js v24.16.0 and a separate local
MongoDB 9.0 replica set named `step67`, bound to `127.0.0.1:27019`.
The pre-existing MongoDB instance on port 27017 was not reconfigured.

```powershell
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27019/it_help_desk_test?replicaSet=step67'
npm test
```

Baseline complete run: **53 tests passed, 0 failed, 0 skipped**, 33.10 seconds.
This includes authentication/session/CSRF tests, all scope-administration
transaction tests, foundation/bootstrap tests, the original complete first
ticket journey, fifteen new operation integration scenarios, and business-day
and elapsed-SLA calculation checks. Tests use isolated UUID-named databases.

Verified behaviors include:

- Triage authorization, category validation, priority matrix/override reasons,
  descriptive PATCH restrictions, and preserved original department/snapshots.
- Public versus internal comments/events/worklogs, staff requester boundaries,
  department supervisor public views, and first-human-response rules.
- Reassignment/unassignment, requester/vendor waits, manual resume, public
  requester replies, immediate support-grant revocation, and pause completion.
- Cancellation/start races, preserved completed worklogs, terminal-state guards,
  blocked pending approvals, same-issue/time-window reopening, new SLA cycles,
  closure confirmation evidence, and authorized follow-up creation.
- Business-day deadlines including holidays/timezone offset changes; resolution
  pauses subtract only business time, response clocks do not pause, and ended
  cycles remain unchanged as wall-clock time advances.
- Private attachment metadata/download denial, parent visibility and ticket
  checks, MIME/signature/extension mismatch, traversal filenames, oversized
  uploads, concurrent five-slot limits, and pending downloads denied.
- Injected filesystem finalization failure, cancellation during finalization,
  orphan cleanup, NOT_CONFIGURED metadata, and clean/infected/error scanner
  protocol responses. Scanner tests use a local stub, not live ClamAV.
- Unique tags/serials under races, multiple blank serials, exact Decimal128
  serialization, scope-filtered inventory, foreign/invalid relationships, and
  administrator limitations.
- Actual partial unique custody index enforcement, one assignment winner,
  normal returns, damaged-return denial, repair/loss/recovery/retirement,
  department corrections requiring both scopes, and transfers blocked after
  custody history exists.
- OWN_ONLY/NONE/shared selection rules, bounded safe ticket asset snapshots,
  unchanged historical snapshots after reassignment/edit, and private backlinks.
- Missing/stale versions, missing/reused idempotency keys, concurrent identical
  retries, rollback of business/history/audit/outbox/idempotency records, active
  account/session checks, and repeatable index/backfill compatibility.

Expected injected audit/outbox exceptions appear in the test log. The matching
tests assert that the resulting 500 responses leave no partial writes.

Also executed successfully against `it_help_desk_demo_step67` on the same
isolated replica set:

```powershell
npm run seed:operations
npm run db:indexes
npm run attachments:cleanup
```

The seed produced only synthetic accounts/catalog data. Cleanup reported zero
pending reservations and zero orphan files in that demo database. New JavaScript
files were formatted with installed Babel tooling after confirming unchanged
ASTs. An unused-variable check using the existing frontend ESLint installation
passed (rest-property omissions are intentional). `node --check` passed for all
89 backend JavaScript files. `git diff --check` passed. The updated index command
was rerun successfully after the final backfill adjustment.

The temporary replica-set process was shut down, and only the generated
workspace `.tmp` directory was removed after verifying its absolute path.
This removed the synthetic demo database and test upload artifacts; the seed
and test scripts remain available for reproduction.

Deployment configuration, cleanup commands, API examples, and limitations are
in [OPERATIONS.md](OPERATIONS.md). No production data migration, real antivirus
deployment, approval module, notification delivery worker, or frontend was run.
