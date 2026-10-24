# Verification record

Validated on Windows, 2026-10-24, using Node.js v24.16.0 and a separate local
MongoDB 9.0 replica set named `step67`, bound to `127.0.0.1:27019`.
The pre-existing MongoDB instance on port 27017 was not reconfigured.

```powershell
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27019/it_help_desk_test?replicaSet=step67'
npm test
```

Latest complete run: **53 tests passed, 0 failed, 0 skipped**, 33.10 seconds.
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
