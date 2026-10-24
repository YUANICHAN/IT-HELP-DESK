# Changed files

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


