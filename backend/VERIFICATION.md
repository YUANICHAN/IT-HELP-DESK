# Verification record

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
