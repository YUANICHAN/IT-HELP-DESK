# Ticket workflow

The original requester journey remains operational:

`NEW → OPEN → IN_PROGRESS → RESOLVED → CLOSED`.

Use `POST /api/v1/tickets`, then `/:id/claim`, `/:id/start`,
`/:id/comments`, `/:id/resolve`, and `/:id/close`.
Every mutation requires the opaque session cookie, Origin, X-CSRF-Token,
and Idempotency-Key. Existing-ticket commands, including comments and uploads,
also require expectedVersion. These requirements now apply to start and
comments as well as the original versioned commands.

Steps 6 and 7 add triage, assignment, waiting/resumption, cancellation,
reopening, internal notes, worklogs, private attachments, and asset custody.
Asset selection is supported; approval-backed creation remains blocked while
the approvals module is unavailable. Original configuration snapshots and
completed SLA cycles are retained. Automatic closure remains disabled.

See [Operations guide](OPERATIONS.md) for the complete endpoint contract,
policy defaults, migration and replica-set commands, synthetic seed,
PowerShell/Postman examples, file cleanup, and remaining limitations.
See [verification results](VERIFICATION.md) for actual test results.
