# Changed files

## Step 11

- `src/modules/dashboard/*`: role-specific dashboard composition using current
  ticket/asset policies and live grants.
- `src/modules/reporting/*`: validated periods/departments, authorized MongoDB
  aggregation, SLA snapshot metrics, reopenings, effort, recurring asset issues,
  and accountability summaries.
- `src/modules/audit/*`: administrator-only allowlisted security/access explorer
  with bounded filters, stable pagination, reference scoping, and redaction.
- `src/modules/health/operationsEvidence.service.js`, `health.service.js`, the
  heartbeat model/service, and `workers/scheduler.js`: storage probe, validated
  backup manifest, per-task freshness/outcome evidence, and component health.
- Ticket, cycle, event, worklog, asset-event, and authentication-audit models add
  reporting/explorer indexes; `ticket.policy.js` adds reusable capability and
  internal filters.
- `src/app.js`, `src/config/env.js`, and `.env.example`: routes and trusted
  operations-evidence configuration.
- `test/summaries.integration.test.js`: deterministic multi-role, overlapping-
  grant, revocation, 75%-attainment, audit-redaction, storage, and backup tests.
- `SUMMARIES_OPERATIONS.md`, `VERIFICATION.md`, and the root README document
  verified behavior and commands.

## Step 10

- `src/modules/outbox/*`: per-recipient/channel transactional outbox records,
  stable deduplication, safe metadata, retry and lease state.
- `src/modules/notifications/*`: notification persistence, current-access
  authorization, safe presentation, list/read API, and producer routing.
- `src/workers/outbox.processor.js`, `src/workers/scheduler.js`, and
  `src/worker.js`: atomic claims, lease recovery, bounded delivery, unified SLA/
  cleanup scheduling, heartbeat, and graceful shutdown.
- `src/modules/maintenance/*`, `src/modules/health/*`: bounded cleanup,
  restart-safe job leases, persisted heartbeat, and administrator health.
- `src/shared/database/idempotency*`, attachment storage/cleanup, `src/app.js`,
  `src/config/env.js`, `.env.example`, and `scripts/create-indexes.js`: explicit
  expiry, bounded file cleanup, routes/configuration, indexes, and migration.
- Ticket, approval, asset, and SLA producers now enqueue safe per-recipient rows
  within their existing business transactions.
- `test/background.integration.test.js` plus updated ticket/approval expectations
  cover delivery and preserve the prior suites.
- `BACKGROUND_DELIVERY.md`, `SLA_BEHAVIOR.md`, `VERIFICATION.md`, and the root
  README document the verified operating model.

## Step 8

The Step 8 working-tree changes are listed below. No frontend files or runtime
dependencies changed. See [APPROVALS.md](APPROVALS.md) for setup, behavior,
PowerShell/Postman requests and limitations, and [VERIFICATION.md](VERIFICATION.md)
for actual test results.

New approval module:

- [approval.model.js](src/modules/approvals/approval.model.js): historical rounds,
  actor/reference validation and actual unique-index definitions.
- [approval.policy.js](src/modules/approvals/approval.policy.js): configured primary/
  backup eligibility, named approver authority and shared fulfillment gate.
- [approvalLifecycle.service.js](src/modules/approvals/approvalLifecycle.service.js):
  pending round creation, supersession and approval pause completion.
- [approvals.service.js](src/modules/approvals/approvals.service.js): authorized
  inbox/history, transaction-backed decisions/reroutes and reauthorized retries.
- [approval.serializer.js](src/modules/approvals/approval.serializer.js): public-only
  decision context; internal reroute reasons restricted to triage history.
- [approvals.validation.js](src/modules/approvals/approvals.validation.js): bounded
  exact command bodies, version checks and allowlisted inbox filters/sorting.
- [approvals.controller.js](src/modules/approvals/approvals.controller.js) and
  [approvals.routes.js](src/modules/approvals/approvals.routes.js): thin HTTP layer
  using existing authentication, CSRF, errors and request metadata.

Existing integration points:

- [src/app.js](src/app.js): approval route registration.
- [ticket.service.js](src/modules/tickets/ticket.service.js): atomic approval-required
  submission, frozen requirement, initial round/pause and safe notifications.
- [ticketOperations.service.js](src/modules/tickets/ticketOperations.service.js):
  fulfillment gate, pending approval cancellation and safe notification recipients.
- [ticket.model.js](src/modules/tickets/ticket.model.js),
  [ticket.policy.js](src/modules/tickets/ticket.policy.js),
  [ticket.routes.js](src/modules/tickets/ticket.routes.js),
  [ticket.serializer.js](src/modules/tickets/ticket.serializer.js), and
  [ticketEvent.model.js](src/modules/tickets/ticketEvent.model.js): current round,
  approved queue access, history/reroute routes and event types.
- [organization.model.js](src/modules/organization/organization.model.js): explicit
  same-organization backup approver configuration.
- [serviceItem.model.js](src/modules/catalog/serviceItem.model.js): incidents cannot
  require approval.
- [slaPause.model.js](src/modules/service-levels/slaPause.model.js),
  [slaCycle.model.js](src/modules/service-levels/slaCycle.model.js), and
  [slaClock.service.js](src/modules/service-levels/slaClock.service.js): approval
  pause reason, REJECTED outcome and target-eligibility reporting.
- [authenticationAudit.model.js](src/modules/auth/authenticationAudit.model.js) and
  [idempotencyKey.model.js](src/shared/database/idempotencyKey.model.js): approval
  audit types and idempotent approval resources.
- [create-indexes.js](scripts/create-indexes.js): additive non-approval ticket
  backfill; existing model registry creates the approval indexes.

Delivery and verification:

- [approvals.integration.test.js](test/approvals.integration.test.js): new replica-set
  coverage and deterministic approval SLA clock checks.
- [ticket.integration.test.js](test/ticket.integration.test.js): expected recoverable
  configuration error replaces the unavailable-module expectation.
- [operations.integration.test.js](test/operations.integration.test.js): labels the
  malformed imported approval guard accurately; prior assertion remains intact.
- [seed-approvals.js](scripts/seed-approvals.js), [package.json](package.json):
  repeatable, isolated synthetic Step 8 seed and npm command.
- [approvals.ps1](examples/approvals.ps1): executed PowerShell walkthrough with
  separate cookies/CSRF, versions, keys and configuration-failure example.
- [APPROVALS.md](APPROVALS.md), [OPERATIONS.md](OPERATIONS.md),
  [VERIFICATION.md](VERIFICATION.md), this inventory and [README.md](../README.md):
  current setup, examples, limitations and verification evidence.

## Steps 6 and 7 baseline

61 files changed or added for Steps 6 and 7. No frontend files or runtime dependencies changed.

## Ticket operations

Ticket commands, current policies, visibility-filtered serializers/history, protected versioned endpoints, and preserved creation snapshots.

- [backend/src/modules/tickets/ticket.controller.js](src/modules/tickets/ticket.controller.js)
- [backend/src/modules/tickets/ticket.model.js](src/modules/tickets/ticket.model.js)
- [backend/src/modules/tickets/ticket.policy.js](src/modules/tickets/ticket.policy.js)
- [backend/src/modules/tickets/ticket.routes.js](src/modules/tickets/ticket.routes.js)
- [backend/src/modules/tickets/ticket.serializer.js](src/modules/tickets/ticket.serializer.js)
- [backend/src/modules/tickets/ticket.service.js](src/modules/tickets/ticket.service.js)
- [backend/src/modules/tickets/ticket.validation.js](src/modules/tickets/ticket.validation.js)
- [backend/src/modules/tickets/ticketComment.model.js](src/modules/tickets/ticketComment.model.js)
- [backend/src/modules/tickets/ticketEvent.model.js](src/modules/tickets/ticketEvent.model.js)
- [backend/src/modules/tickets/ticketOperations.service.js](src/modules/tickets/ticketOperations.service.js)
- [backend/src/modules/tickets/ticketOperations.validation.js](src/modules/tickets/ticketOperations.validation.js)
- [backend/src/modules/tickets/ticketWorklog.model.js](src/modules/tickets/ticketWorklog.model.js)

## SLA accounting

Resolution-only pauses, business-calendar calculations, cycle summaries and completed-cycle preservation.

- [backend/src/modules/service-levels/businessTime.js](src/modules/service-levels/businessTime.js)
- [backend/src/modules/service-levels/slaClock.service.js](src/modules/service-levels/slaClock.service.js)
- [backend/src/modules/service-levels/slaCycle.model.js](src/modules/service-levels/slaCycle.model.js)
- [backend/src/modules/service-levels/slaPause.model.js](src/modules/service-levels/slaPause.model.js)

## Assets

Inventory, financial privacy, authoritative custody, partial unique indexes, lifecycle services and safe ticket selection/backlinks.

- [backend/src/modules/assets/asset.controller.js](src/modules/assets/asset.controller.js)
- [backend/src/modules/assets/asset.model.js](src/modules/assets/asset.model.js)
- [backend/src/modules/assets/asset.policy.js](src/modules/assets/asset.policy.js)
- [backend/src/modules/assets/asset.serializer.js](src/modules/assets/asset.serializer.js)
- [backend/src/modules/assets/asset.service.js](src/modules/assets/asset.service.js)
- [backend/src/modules/assets/asset.validation.js](src/modules/assets/asset.validation.js)
- [backend/src/modules/assets/assetAssignment.model.js](src/modules/assets/assetAssignment.model.js)
- [backend/src/modules/assets/assetCustody.service.js](src/modules/assets/assetCustody.service.js)
- [backend/src/modules/assets/assetEvent.model.js](src/modules/assets/assetEvent.model.js)
- [backend/src/modules/assets/assetSelection.service.js](src/modules/assets/assetSelection.service.js)
- [backend/src/modules/assets/assets.routes.js](src/modules/assets/assets.routes.js)

## Attachments

Private multipart uploads, signature checks, reservations/finalization/compensation, scanning adapter and cleanup.

- [backend/src/adapters/scanning/clamav.adapter.js](src/adapters/scanning/clamav.adapter.js)
- [backend/src/adapters/storage/localStorage.adapter.js](src/adapters/storage/localStorage.adapter.js)
- [backend/src/config/storage.js](src/config/storage.js)
- [backend/src/modules/attachments/attachment.model.js](src/modules/attachments/attachment.model.js)
- [backend/src/modules/attachments/attachment.routes.js](src/modules/attachments/attachment.routes.js)
- [backend/src/modules/attachments/attachment.service.js](src/modules/attachments/attachment.service.js)
- [backend/src/modules/attachments/attachment.validation.js](src/modules/attachments/attachment.validation.js)

## Shared integration

Route registration, fresh account/session/grant checks, reusable idempotent transactions, catalog asset policy, audit and outbox integration.

- [backend/src/app.js](src/app.js)
- [backend/src/middleware/authenticate.js](src/middleware/authenticate.js)
- [backend/src/modules/access/currentAccess.service.js](src/modules/access/currentAccess.service.js)
- [backend/src/modules/auth/audit.service.js](src/modules/auth/audit.service.js)
- [backend/src/modules/auth/authenticationAudit.model.js](src/modules/auth/authenticationAudit.model.js)
- [backend/src/modules/catalog/serviceItem.model.js](src/modules/catalog/serviceItem.model.js)
- [backend/src/modules/outbox/outboxEvent.model.js](src/modules/outbox/outboxEvent.model.js)
- [backend/src/shared/database/command.js](src/shared/database/command.js)
- [backend/src/shared/database/idempotency.js](src/shared/database/idempotency.js)
- [backend/src/shared/database/idempotencyKey.model.js](src/shared/database/idempotencyKey.model.js)
- [backend/src/shared/validation/commands.js](src/shared/validation/commands.js)

## Tests and operational scripts

Replica-set integration/regression tests, additive index/backfill workflow, synthetic seed, private-file cleanup and isolated MongoDB helpers.

- [backend/scripts/cleanup-attachments.js](scripts/cleanup-attachments.js)
- [backend/scripts/create-indexes.js](scripts/create-indexes.js)
- [backend/scripts/init-test-replica.js](scripts/init-test-replica.js)
- [backend/scripts/seed-operations.js](scripts/seed-operations.js)
- [backend/scripts/stop-test-replica.js](scripts/stop-test-replica.js)
- [backend/test/operations.integration.test.js](test/operations.integration.test.js)
- [backend/test/support/operations.js](test/support/operations.js)
- [backend/test/ticket.integration.test.js](test/ticket.integration.test.js)

## Configuration and documentation

Environment examples, npm commands, API/verification guides and generated-storage exclusions.

- [.gitignore](../.gitignore)
- [README.md](../README.md)
- [backend/.env.example](.env.example)
- [backend/CHANGED_FILES.md](CHANGED_FILES.md)
- [backend/OPERATIONS.md](OPERATIONS.md)
- [backend/TICKET_WORKFLOW.md](TICKET_WORKFLOW.md)
- [backend/VERIFICATION.md](VERIFICATION.md)
- [backend/package.json](package.json)

