# First ticket workflow

This stage implements the requester-to-technician journey at `/api/v1`:

- `POST /tickets`
- `GET /tickets`
- `GET /tickets/:ticketId`
- `GET /queue`
- `POST /tickets/:ticketId/claim`
- `POST /tickets/:ticketId/start`
- `GET|POST /tickets/:ticketId/comments`
- `GET /tickets/:ticketId/events`
- `POST /tickets/:ticketId/resolve`
- `POST /tickets/:ticketId/close`

All routes require the existing session cookie and a completed mandatory
password change. State-changing routes also require the session-bound token in
`X-CSRF-Token`. Ticket creation, claim, resolution, and closure additionally
require an `Idempotency-Key` containing 8 through 128 letters, numbers,
periods, underscores, colons, or hyphens. Keys are scoped by organization,
user, and operation and retained for 24 hours.

## Configuration prerequisites

The repository did not contain the service-catalog or service-level modules
shown in `plan.md`. This stage adds the minimum models needed by ticket
creation: `ServiceItem`, `SlaPolicy`, and `BusinessCalendar`. A usable service
item must be active, belong to the requester's organization, and reference an
active policy whose active calendar belongs to that organization. The API
captures complete copies of all three configuration documents in the ticket
and its first SLA cycle.

This stage intentionally does not expose catalog-administration endpoints.
Existing configuration records can be used directly; otherwise they must be
provisioned by a later administrative stage or a controlled deployment/seed
process. Approval-required service items return
`409 APPROVAL_WORKFLOW_REQUIRED` before any ticket write. Supplying `assetIds`
returns `422 ASSET_SELECTION_UNSUPPORTED` because an asset module is not
present.

No response or resolution due date is calculated. The first SLA cycle records
the original submission time and frozen configuration and is ended at
resolution. Breach monitoring is not implemented.

## Transactions are mandatory

Ticket mutations atomically write the ticket state, ticket timeline, audit
event, pending outbox event, SLA state where applicable, and idempotency record
where applicable. MongoDB must run as a replica set or through `mongos`.
Standalone MongoDB returns `503 TRANSACTIONS_UNAVAILABLE`; the API does not
fall back to partial writes.

For a local single-node replica set, back up the database, configure MongoDB,
restart it, initialize it once, and update the connection string:

```yaml
replication:
  replSetName: rs0
```

```powershell
Restart-Service MongoDB
mongosh --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})"
```

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/it_help_desk?replicaSet=rs0
```

## Authorization behavior

The requester can see their own tickets. A technician needs a current
department `support` grant and can see only their assigned tickets plus
eligible unassigned queue tickets. Department supervision provides the public
view, and triage provides the staff view for its current scope. Administrator
role alone grants no access to another requester's tickets.

The visibility predicate is applied in MongoDB before fetching or counting
tickets and is reused before comments and events are loaded. Assignment never
bypasses a revoked support grant. This stage stores only public comments; there
are no internal notes.

## Workflow and concurrency

The only supported transitions are:

```text
NEW --claim--> OPEN --start--> IN_PROGRESS --resolve--> RESOLVED --requester close--> CLOSED
```

Claim, start, resolve, and close require `expectedVersion`. A mismatched version
returns `409 STALE_TICKET_VERSION`. Conditional writes and a version increment
ensure competing claims cannot both succeed. Assignment and automated events
do not count as a response. The first public reply by a permitted staff member
sets `firstResponseAt`; a public resolution summary does so when there was no
earlier response.

Outbox documents are created with `status: PENDING`. No notification is
reported as delivered because this stage does not include an outbox worker.

## PowerShell walkthrough

PowerShell's web session retains the HttpOnly cookie. Use separate sessions for
the employee and technician.

```powershell
$BaseUrl = "http://127.0.0.1:5000/api/v1"
$Origin = "http://127.0.0.1:5000"

$EmployeeSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$EmployeeLogin = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/auth/login" `
  -WebSession $EmployeeSession `
  -Headers @{ Origin = $Origin } `
  -ContentType "application/json" `
  -Body (@{ email = "employee@example.com"; password = "YOUR_PASSWORD" } | ConvertTo-Json)
$EmployeeCsrf = $EmployeeLogin.data.csrfToken

$Created = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/tickets" `
  -WebSession $EmployeeSession `
  -Headers @{ Origin = $Origin; "X-CSRF-Token" = $EmployeeCsrf; "Idempotency-Key" = "create-$([guid]::NewGuid())" } `
  -ContentType "application/json" `
  -Body (@{
    serviceItemId = "SERVICE_ITEM_OBJECT_ID"
    locationId = "LOCATION_OBJECT_ID"
    title = "Office printer cannot print"
    description = "The office printer accepts jobs but never prints any pages."
    urgency = "MEDIUM"
  } | ConvertTo-Json)
$TicketId = $Created.data.ticket.id

$TechnicianSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$TechnicianLogin = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/auth/login" `
  -WebSession $TechnicianSession `
  -Headers @{ Origin = $Origin } `
  -ContentType "application/json" `
  -Body (@{ email = "technician@example.com"; password = "YOUR_PASSWORD" } | ConvertTo-Json)
$TechnicianCsrf = $TechnicianLogin.data.csrfToken

$Queue = Invoke-RestMethod -Method Get -Uri "$BaseUrl/queue?limit=25" -WebSession $TechnicianSession
$Claimed = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/tickets/$TicketId/claim" `
  -WebSession $TechnicianSession `
  -Headers @{ Origin = $Origin; "X-CSRF-Token" = $TechnicianCsrf; "Idempotency-Key" = "claim-$([guid]::NewGuid())" } `
  -ContentType "application/json" `
  -Body (@{ expectedVersion = $Queue.data.tickets[0].version } | ConvertTo-Json)

$Started = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/tickets/$TicketId/start" `
  -WebSession $TechnicianSession `
  -Headers @{ Origin = $Origin; "X-CSRF-Token" = $TechnicianCsrf } `
  -ContentType "application/json" `
  -Body (@{ expectedVersion = $Claimed.data.ticket.version } | ConvertTo-Json)

$Reply = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/tickets/$TicketId/comments" `
  -WebSession $TechnicianSession `
  -Headers @{ Origin = $Origin; "X-CSRF-Token" = $TechnicianCsrf } `
  -ContentType "application/json" `
  -Body (@{ body = "I reproduced the problem and am applying a fix." } | ConvertTo-Json)

$Current = Invoke-RestMethod -Method Get -Uri "$BaseUrl/tickets/$TicketId" -WebSession $TechnicianSession
$Resolved = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/tickets/$TicketId/resolve" `
  -WebSession $TechnicianSession `
  -Headers @{ Origin = $Origin; "X-CSRF-Token" = $TechnicianCsrf; "Idempotency-Key" = "resolve-$([guid]::NewGuid())" } `
  -ContentType "application/json" `
  -Body (@{
    expectedVersion = $Current.data.ticket.version
    summary = "Corrected the printer network settings and verified a test page."
    resolutionCode = "FIXED"
  } | ConvertTo-Json)

$Closed = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/tickets/$TicketId/close" `
  -WebSession $EmployeeSession `
  -Headers @{ Origin = $Origin; "X-CSRF-Token" = $EmployeeCsrf; "Idempotency-Key" = "close-$([guid]::NewGuid())" } `
  -ContentType "application/json" `
  -Body (@{ expectedVersion = $Resolved.data.ticket.version } | ConvertTo-Json)

$Comments = Invoke-RestMethod -Method Get -Uri "$BaseUrl/tickets/$TicketId/comments" -WebSession $EmployeeSession
$Events = Invoke-RestMethod -Method Get -Uri "$BaseUrl/tickets/$TicketId/events" -WebSession $EmployeeSession
```

In Postman, enable its cookie jar, send `Origin` with the configured allowed
origin, save `data.csrfToken` from login as `csrfToken`, and use
`X-CSRF-Token: {{csrfToken}}` for mutations. Add a new `Idempotency-Key` to
create, claim, resolve, and close. Reuse the same key and identical body only
when retrying the same logical command.
