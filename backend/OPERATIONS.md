# Steps 6 and 7: tickets, protected files, and assets

This backend uses the existing opaque session cookie, CSRF middleware, current
scope grants, MongoDB transactions, audit collection, and outbox. Health remains
at `GET /api/v1/health`. There are no frontend changes or new runtime packages.

## Policy decisions where the checked-in plan is silent

`plan.md` contains a proposed directory tree, not the policy tables referenced
in the task. The following explicit defaults are implemented and tested:

| Impact / urgency | HIGH | MEDIUM | LOW |
| --- | --- | --- | --- |
| HIGH | P1 | P2 | P3 |
| MEDIUM | P2 | P3 | P4 |
| LOW | P3 | P4 | P4 |

New tickets keep the previous MEDIUM impact default. Triage may choose a
different priority only with a reason. Categories come from the ticket's
snapshotted `service.configuration.categories`; the fallback is `HARDWARE`,
`SOFTWARE`, `NETWORK`, `ACCESS`, `OTHER`.

Requesters may change only title/description on NEW or OPEN work that has never
started. Scoped triage supervisors may change those fields on active tickets
with a reason. Operator reasons, triage/assignment changes, cancellation reasons,
and confirmation evidence are staff history. Public next steps are public
comments. Public detail still shows current status and assignment.

Internal access requires current scoped triage, or a current supporting
technician assigned to the ticket or eligible to claim its unassigned queue
work. A requester who happens to be staff does not gain internal access from
that relationship. Department supervision alone is public-only. Worklogs use
the same staff read boundary; only the assigned eligible technician may write
them during IN_PROGRESS or either waiting state.

Financial fields, full custody history, asset events, and current custodian
identity are asset-manager-only. Support and department supervision get safe
inventory views. All roles can see safe details of their own current custody.
Administrator role alone grants no operational access.

Three business days means the same local wall time on the third subsequent
scheduled working date, excluding full-day holidays. The deadline is inclusive.
The original calendar's timezone and weekly windows are used, including timezone
offset changes. Overnight business windows and partial-day holiday exceptions
are not supported by this calendar format; use separate daily windows. Triage
may reopen RESOLVED work outside that window with a reason.

## Setup, indexes, and isolated validation

Use Node.js 24 and MongoDB with transactions enabled. From `backend`:

```powershell
npm ci
# Configure backend/.env, including an actual replica-set URI and CSRF secret.
npm run db:indexes
npm start
```

`db:indexes` creates every registered collection/index without dropping indexes.
It also backfills old public event visibility, attachment counters, SLA cycle
numbers, and original work/response timestamps from Step 5 records. It leaves
snapshot contents and original clock starts untouched. Run it before accepting
traffic after upgrading. Existing duplicate data causes index creation to fail;
the command does not discard conflicting history.

The actual database constraints are `asset_tag_unique`,
`asset_serial_supplied_unique` (string serials only), and
`one_active_asset_custodian` (`returnedAt: null`). These use MongoDB's
[partial unique index semantics](https://www.mongodb.com/docs/manual/core/index-partial/).
Tags and supplied serials are trimmed and uppercased. Blank serials become null.
No separately editable `assignedUserId` exists on an asset.

For a separate local test replica set, run from the repository root, in one
PowerShell window (adjust the MongoDB executable version if necessary):

```powershell
New-Item -ItemType Directory -Force .tmp/mongo-step67 | Out-Null
& 'C:\Program Files\MongoDB\Server\9.0\bin\mongod.exe' `
  --dbpath .tmp/mongo-step67 --port 27019 --bind_ip 127.0.0.1 `
  --replSet step67 --logpath .tmp/mongo-step67/mongod.log
```

In a second window:

```powershell
Set-Location backend
node scripts/init-test-replica.js
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27019/it_help_desk_test?replicaSet=step67'
npm test
```

Tests create UUID-named databases and drop them afterward. Step 6/7 tests fail
explicitly if the selected server is standalone. Test uploads use private
`.tmp/attachments-*` directories. Expected injected audit/outbox failures are
printed during rollback tests; those requests must return 500 and leave no
partial business records. See [verification results](VERIFICATION.md).

## File configuration and cleanup

```dotenv
ATTACHMENT_STORAGE_ROOT=C:/private/it-help-desk
MALWARE_SCAN_ENABLED=false
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
```

An empty storage root defaults to repository `private-storage`. Never expose
that directory through a web server. The API rejects storage roots beneath the
frontend or backend public directory. The service account needs read/write
access to its `temporary` and `attachments` subdirectories.

PNG, JPEG, and PDF uploads require agreeing extension, declared MIME, detected
signature, and nonzero size at most 5 MiB. Exactly one `file` is accepted per
request; the total multipart request is capped at 5 MiB plus 64 KiB. Five slots
per ticket include PENDING reservations. Stored paths use UUIDs; user filenames
are display-only. Ticket version increments on reservation and finalization
(and compensation), so refresh detail after an upload.

Without scanning, files are marked `NOT_CONFIGURED`, never malware-clean.
With scanning enabled, the implementation uses the official
[ClamAV INSTREAM protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html).
Only an explicit clean response makes a new file READY. Errors, timeouts, or
infection reject the upload and release its slot. Existing NOT_CONFIGURED files
also become unavailable for download while scanning is enabled; a historical
rescan/migration worker is not included in this stage. The test suite uses a
local protocol stub, not a live antivirus engine.

Filesystem writes occur outside database transactions. Upload reserves a slot
and commits PENDING history, writes/finalizes private storage, then reauthorizes
and commits READY history. Failure compensates the reservation; a crash leaves
a PENDING record for cleanup. An already-created ticket is never deleted.
Concurrent cancellation/reassignment is rechecked before READY. Downloads check
current session/access, attachment state and parent visibility, set attachment
Content-Disposition and `nosniff`, and expose no storage URL or filesystem path.

Run this periodically using an external scheduler, with the same database and
storage-root settings as the API:

```powershell
npm run attachments:cleanup
```

It atomically changes PENDING reservations older than one hour to DELETED,
releases their slots, records history/audit/outbox, and removes old orphan or
rejected files. READY files are retained. Failed uploads are REJECTED; comments
and worklogs have no edit/delete endpoints.

After local validation, stop only the test replica set and optionally remove
the generated `.tmp` directory. Resolve and check the target before deletion:

```powershell
# From backend; script refuses a replica set whose name is not step67.
node scripts/stop-test-replica.js
Set-Location ..
$WorkspacePath = (Resolve-Path .).Path
$CleanupPath = [IO.Path]::GetFullPath((Join-Path $WorkspacePath '.tmp'))
if ($CleanupPath -ne (Join-Path $WorkspacePath '.tmp')) { throw 'Unexpected cleanup path' }
Remove-Item -LiteralPath $CleanupPath -Recurse -Force
```

## API contract

All paths below start with `/api/v1`. Every mutation requires the session cookie,
`Origin` matching configuration, `X-CSRF-Token`, and `Idempotency-Key`. Keys last
24 hours, are scoped to actor/organization/operation, and must contain 8–128
letters, digits, `.`, `_`, `:`, or `-`. Reuse the identical body/key for a retry;
changed input returns 409. A replay reauthorizes and returns a safe current
resource view rather than a cached private response.

Every command on an existing ticket or asset requires integer `expectedVersion`.
Create endpoints do not. Missing versions/keys return 400; competing/stale
versions return 409. Inaccessible records return 404. The Step 5 start/comment
paths remain, but clients must now supply their version and idempotency key.

| Ticket endpoint | Additional body fields / behavior |
| --- | --- |
| `POST /tickets` | `serviceItemId`, title (10–150), description (20–5000), urgency; optional locationId, assetIds (max 20, deduplicated), primaryAssetId, followUpOfId |
| `PATCH /tickets/:id` | title and/or description; reason for triage edits |
| `POST /tickets/:id/triage` | category, impact; optional urgency, priority, reason |
| `POST /tickets/:id/assignment` | assigneeId (ID or null), reason; triage only |
| `POST /tickets/:id/claim` | Eligible technician; unassigned NEW/OPEN |
| `POST /tickets/:id/start` | Assigned technician; OPEN → IN_PROGRESS |
| `POST /tickets/:id/wait` | status: WAITING_REQUESTER/WAITING_VENDOR, reason, public nextStep |
| `POST /tickets/:id/resume` | Assigned technician; vendor waits require public dependencyUpdate |
| `POST /tickets/:id/comments` | body, visibility: PUBLIC/INTERNAL (default PUBLIC) |
| `POST /tickets/:id/worklogs` | ISO timezone timestamps start/end, notes; duration derived by server |
| `POST /tickets/:id/resolve` | summary, resolutionCode: FIXED/WORKAROUND/FULFILLED/NO_FAULT_FOUND |
| `POST /tickets/:id/cancel` | reason; requester before work begins, triage on active non-resolved states |
| `POST /tickets/:id/close` | Requester confirms; triage must supply confirmationEvidence |
| `POST /tickets/:id/reopen` | reason; requester also supplies sameIssue:true and meets deadline |
| `POST /tickets/:id/attachments` | Multipart file, expectedVersion, optional visibility and commentId |

`GET /tickets`, `/queue`, `/tickets/:id`, and the ticket's `/comments`, `/events`,
`/worklogs`, `/attachments` collections are authorized before counts/pagination.
Collection pagination uses `page`/`limit`, default 1/25, maximum limit 100.
Ticket detail includes safe `slaCycles` elapsed summaries. Response business
time never subtracts pauses; resolution business time subtracts only
WAITING_REQUESTER intervals. Completed cycles use their recorded end time.
Reassignment preserves status, except removing an assignee from started/waiting
work returns OPEN and closes the pause. A public requester reply resumes
WAITING_REQUESTER only if an eligible assignee remains; otherwise it clears the
assignee and returns OPEN. Original submission and completed cycles never reset.

`GET /attachments/:id` returns authorized metadata;
`GET /attachments/:id/download` returns the protected file.

| Asset endpoint | Additional body fields / behavior |
| --- | --- |
| `GET /assets` | search (tag/serial), departmentId, category, status, page, limit |
| `POST /assets` | assetTag, category, departmentId; optional descriptive/financial fields below |
| `GET /assets/selectable` | serviceItemId required; locationId and inventory filters optional |
| `GET /assets/:id` | Safe detail; manager sees current custody, custodian sees only own assignment |
| `PATCH /assets/:id` | Editable descriptive/financial fields; department correction requires reason and both scopes |
| `POST /assets/:id/assign` | custodianId (active EMPLOYEE in current department), optional locationId |
| `POST /assets/:id/return` | condition GOOD/FAIR; optional notes; normal ASSIGNED return only |
| `POST /assets/:id/state` | action and reason, plus lifecycle fields below |
| `GET /assets/:id/custody` | Manager-only historical custody, paginated |
| `GET /assets/:id/events` | Manager-only events, ticket references reauthorized |
| `GET /assets/:id/tickets` | Ticket-policy-filtered backlinks/count; requester view only own tickets |

Descriptive fields: serialNumber, category, manufacturer, model, departmentId,
locationId, shared (boolean), condition. Financial fields: purchaseDate and
warrantyEndDate (`YYYY-MM-DD` or null), purchaseCost (decimal string or null,
up to 14 integer digits and two decimals), currency (three uppercase letters,
default PHP). Money is stored as Decimal128 and serialized as a decimal string.
Generic PATCH rejects tag, status, custody, creator, and organization changes.
Any custody history blocks ordinary department changes, even after return.

| Lifecycle action | Requirements and result |
| --- | --- |
| SEND_FOR_REPAIR | Accessible active ticketId already linked to this asset; AVAILABLE/ASSIGNED → UNDER_REPAIR; retains custody |
| COMPLETE_REPAIR | UNDER_REPAIR, condition GOOD/FAIR; restores ASSIGNED with custody, AVAILABLE otherwise |
| MARK_LOST | Incident reference; AVAILABLE/ASSIGNED/UNDER_REPAIR → LOST, retains custody |
| RECOVER | LOST, condition GOOD/FAIR; restores ASSIGNED/AVAILABLE |
| RETIRE | Reason/reference; ends custody and sets RETIRED atomically |

A damaged normal return is rejected: send it for repair or retire it explicitly.
Repair/loss accountability cannot be silently cleared through return. Shared
equipment can stay AVAILABLE without an individual custodian.

Ticket selection uses `ServiceItem.assetPolicy`, or an existing
`configuration.assetPolicy` override: NONE, OWN_ONLY, OWN_OR_SHARED_DEPARTMENT.
Shared selection requires the requester's department and matching ticket
location (or an asset with no specific location). Optional
`configuration.assetCategories` further restricts categories. LOST/RETIRED
equipment cannot be newly selected. Ticket links snapshot only tag,
category/model, permitted department/location, asset ID and primary flag.
Snapshots survive later edits/return/reassignment and grant no new ticket access.

## Synthetic seed and PowerShell walkthrough

The seed only writes database `it_help_desk_demo_step67`. It creates synthetic
identities, scopes, and catalog/SLA configuration; repeat runs retain the same
records and passwords. It prints IDs, never the password. Register equipment
through the API so its history/audit/outbox are exercised.

```powershell
Set-Location backend
$env:MONGODB_URI = 'mongodb://127.0.0.1:27019/it_help_desk_demo_step67?replicaSet=step67'
$env:DEMO_PASSWORD = 'Choose-a-unique-demo-password!'
npm run seed:operations
npm start
```

In another PowerShell window, copy the IDs printed by the seed:

```powershell
$Base = 'http://127.0.0.1:5000/api/v1'
$Origin = 'http://127.0.0.1:5000'
$DepartmentId = '<seed departmentId>'
$LocationId = '<seed locationId>'
$ServiceItemId = '<seed serviceItemId>'
$EmployeeId = '<seed employee user id>'
$TechnicianId = '<seed technician user id>'
$Password = 'Choose-a-unique-demo-password!'
$Clients = @{}
foreach ($Name in @('employee', 'technician', 'supervisor')) {
  $Login = Invoke-RestMethod -Method Post -Uri "$Base/auth/login" `
    -SessionVariable LoginSession -Headers @{ Origin = $Origin } `
    -ContentType 'application/json' `
    -Body (@{ email = "$Name@demo.example"; password = $Password } | ConvertTo-Json)
  $Clients[$Name] = @{ Session = $LoginSession; Csrf = $Login.data.csrfToken }
}
function Send-Json($Name, $Method, $Path, $Body, $Key) {
  if (-not $Key) { $Key = [guid]::NewGuid().ToString() }
  Invoke-RestMethod -Method $Method -Uri "$Base$Path" `
    -WebSession $Clients[$Name].Session -ContentType 'application/json' `
    -Headers @{ Origin = $Origin; 'X-CSRF-Token' = $Clients[$Name].Csrf; 'Idempotency-Key' = $Key } `
    -Body ($Body | ConvertTo-Json -Depth 10)
}
function Get-Ticket($Name, $Id) {
  (Invoke-RestMethod "$Base/tickets/$Id" -WebSession $Clients[$Name].Session).data.ticket
}
function Ticket-Command($Name, $Id, $Action, $Fields) {
  $Fields.expectedVersion = (Get-Ticket $Name $Id).version
  Send-Json $Name 'Post' "/tickets/$Id/$Action" $Fields
}

$Asset = (Send-Json 'supervisor' 'Post' '/assets' @{
  assetTag = 'DEMO-LAPTOP-001'; category = 'LAPTOP'; manufacturer = 'Synthetic'
  model = 'Demo Notebook'; departmentId = $DepartmentId; locationId = $LocationId
  serialNumber = ''; shared = $false; condition = 'GOOD'
  purchaseDate = '2026-01-01'; warrantyEndDate = '2027-01-01'
  purchaseCost = '25000.00'; currency = 'PHP'
}).data.asset
$Asset = (Send-Json 'supervisor' 'Post' "/assets/$($Asset.id)/assign" @{
  expectedVersion = $Asset.version; custodianId = $EmployeeId; locationId = $LocationId
}).data.asset

$CreateKey = [guid]::NewGuid().ToString()
$CreateBody = @{
  serviceItemId = $ServiceItemId; title = 'Laptop cannot connect to Wi-Fi'
  description = 'The assigned laptop cannot connect to the office wireless network.'
  urgency = 'HIGH'; locationId = $LocationId
  assetIds = @($Asset.id); primaryAssetId = $Asset.id
}
$Ticket = (Send-Json 'employee' 'Post' '/tickets' $CreateBody $CreateKey).data.ticket
$Id = $Ticket.id
# A transport retry uses the identical body and key:
$Retry = Send-Json 'employee' 'Post' '/tickets' $CreateBody $CreateKey

Ticket-Command 'supervisor' $Id 'triage' @{ category = 'NETWORK'; impact = 'MEDIUM' }
Ticket-Command 'supervisor' $Id 'assignment' @{ assigneeId = $TechnicianId; reason = 'Network support dispatch' }
Ticket-Command 'technician' $Id 'start' @{}
Ticket-Command 'technician' $Id 'comments' @{ visibility = 'INTERNAL'; body = 'Staff diagnostic detail.' }
Ticket-Command 'technician' $Id 'worklogs' @{
  start = '2026-10-24T01:00:00Z'; end = '2026-10-24T01:30:00Z'; notes = 'Investigated wireless configuration.'
}
Ticket-Command 'technician' $Id 'wait' @{
  status = 'WAITING_REQUESTER'; reason = 'Need reproduction details'; nextStep = 'Please send a screenshot of the error.'
}
Ticket-Command 'employee' $Id 'comments' @{ body = 'The error appears immediately after sign-in.' }

# Multipart in Windows PowerShell 5.1 or PowerShell 7. curl sets the boundary;
# explicitly set the file part's MIME type to match the actual file.
$Cookie = $Clients.employee.Session.Cookies.GetCookieHeader([uri]$Base)
$Version = (Get-Ticket 'employee' $Id).version
$UploadJson = curl.exe --silent --show-error --fail-with-body `
  --cookie $Cookie -H "Origin: $Origin" `
  -H "X-CSRF-Token: $($Clients.employee.Csrf)" `
  -H "Idempotency-Key: $([guid]::NewGuid())" `
  -F "expectedVersion=$Version" -F 'visibility=PUBLIC' `
  -F 'file=@C:/temp/error.png;type=image/png' "$Base/tickets/$Id/attachments"
$Upload = $UploadJson | ConvertFrom-Json
Invoke-WebRequest "$Base/attachments/$($Upload.data.attachment.id)/download" `
  -WebSession $Clients.employee.Session -OutFile 'C:\temp\downloaded-error.png'

Ticket-Command 'technician' $Id 'resolve' @{ summary = 'Corrected Wi-Fi configuration and verified connectivity.'; resolutionCode = 'FIXED' }
Ticket-Command 'employee' $Id 'reopen' @{ sameIssue = $true; reason = 'The same issue recurred.' }
Ticket-Command 'technician' $Id 'start' @{}
Ticket-Command 'technician' $Id 'resolve' @{ summary = 'Replaced the wireless driver and confirmed operation.'; resolutionCode = 'FIXED' }
Ticket-Command 'employee' $Id 'close' @{}

$Asset = (Invoke-RestMethod "$Base/assets/$($Asset.id)" -WebSession $Clients.supervisor.Session).data.asset
Send-Json 'supervisor' 'Post' "/assets/$($Asset.id)/return" @{
  expectedVersion = $Asset.version; condition = 'GOOD'; notes = 'Returned to inventory.'
}
```

`Ticket-Command` fetches a version for a **new** command. For retries, retain
the original body/version/key instead of calling that helper again. On 409,
reload the resource and decide the next command. Upload separately after
ticket creation; a failed upload leaves that ticket intact.

## Postman

Enable the cookie jar. Login separately for each identity, retaining the correct
cookie for each role. Use an environment with `baseUrl`, `origin`, `ticketId`,
`assetId`, `csrfToken`, `version`, and `commandKey`.

Login: `POST {{baseUrl}}/auth/login`, JSON email/password, header
`Origin: {{origin}}`. Save the returned `data.csrfToken` in a post-response script:

```javascript
pm.environment.set('csrfToken', pm.response.json().data.csrfToken);
```

For each new command, fetch detail and copy `data.ticket.version` or
`data.asset.version`; choose a new UUID commandKey. Mutation headers are
`Origin: {{origin}}`, `X-CSRF-Token: {{csrfToken}}`, and
`Idempotency-Key: {{commandKey}}`. Keep the key/body unchanged on retry.

Assignment example, `POST {{baseUrl}}/assets/{{assetId}}/assign`:

```json
{ "expectedVersion": 0, "custodianId": "<employee-id>", "locationId": "<location-id>" }
```

Wait example, `POST {{baseUrl}}/tickets/{{ticketId}}/wait`:

```json
{ "expectedVersion": 3, "status": "WAITING_REQUESTER", "reason": "Need reproduction", "nextStep": "Please attach a screenshot." }
```

Attachment example: `POST {{baseUrl}}/tickets/{{ticketId}}/attachments`, Body →
form-data, one `file` field of type File, `expectedVersion` as text, `visibility`
as PUBLIC/INTERNAL, optional `commentId`. Set the file part's MIME to image/png,
image/jpeg, or application/pdf as appropriate. Remove manually supplied Content-Type
so Postman supplies the boundary. Use the same cookie jar for the download GET.

## Explicit limitations

Step 8 now implements approval-required creation, decisions, rerouting and atomic
cancellation of pending rounds; see [the approvals guide](APPROVALS.md). Malformed
imported approval tickets without a valid round remain blocked. CLOSED, REJECTED
and CANCELLED are terminal, and automatic closure remains disabled.

Outbox events are committed but no delivery worker exists. A future worker must
reauthorize recipients and source records at delivery time; events contain
identifiers, never note/worklog/attachment previews. Audit retention retains
the existing project's configured TTL; append-only ticket/asset history has no
TTL. No full SLA breach scheduler, frontend, bulk import, formal transfer or
disposal approval, depreciation, procurement, or maintenance scheduler is added.

Historical malware rescanning is not implemented. Default file format checks
are not an antivirus guarantee. Live ClamAV deployment must be verified in the
target environment; only its clean/infected/error protocol paths were tested
locally. See [changed-file inventory](CHANGED_FILES.md).
