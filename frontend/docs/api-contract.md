# Deskflow frontend API contract

## Review scope and confidence

This is the Step 1 contract review for the React/Vite plain JavaScript frontend. The checked-in backend is authoritative. Proposed frontend routes are browser routes; API paths are relative to `/api/v1`.

Capability labels mean:

- **Available**: route registration was traced through validation, authorization, service behavior, and safe response serialization. Relevant automated tests or recorded integration evidence also exists.
- **Partial**: useful backend behavior exists, but a production frontend flow is blocked or materially limited by another missing contract.
- **Missing**: no registered backend route implements the planned capability.
- **Unverified**: static evidence is incomplete or behavior has no meaningful test evidence. A registered route alone is never treated as proof.

`Static` below means this review inspected current source. `Recorded runtime` means the repository records a prior integration run; it does not mean this review reran that workflow. The repository records 94 passing backend tests on an isolated MongoDB replica set, including auth, access, tickets, approvals, attachments, assets, SLA, notifications, dashboard, reports, audit, and health (`backend/VERIFICATION.md:3-35`). No MongoDB listener was available during this review, so no current database-backed integration run was performed.

## Common HTTP contract

### Envelopes, errors, and transport

- JSON success responses use `{ "data": ... }`; `POST /auth/logout` and `DELETE /auth/sessions/:sessionId` return `204` with no body. The global error shape is `{ "error": { "code", "message", "requestId", "details"? } }` (`backend/src/app.js:63-109`). Display the safe message and retain `requestId` for support diagnostics.
- Unknown endpoints return `404 NOT_FOUND`. Malformed JSON returns `400 INVALID_JSON`; JSON over 100 KiB returns `413 PAYLOAD_TOO_LARGE` (`backend/src/app.js:33,63-109`).
- All auth and feature routes set `Cache-Control: no-store`; the public liveness endpoint also does so (`backend/src/app.js:35-47`; route modules cited below).
- Browser requests must send `credentials: "include"`. JSON requests send `Accept: application/json`; set `Content-Type: application/json` only when a JSON body exists. Multipart uploads must let the browser set its boundary.
- State-changing browser requests are origin-checked. Authenticated mutations require `X-CSRF-Token`, except login (`backend/src/middleware/validateOrigin.js:4-71`; `backend/src/middleware/csrfProtection.js:4-18`).
- **Cross-origin defect/dependency:** preflight currently advertises only `Content-Type, X-CSRF-Token` and `GET, POST, DELETE, OPTIONS`; it omits `Idempotency-Key` and `PATCH` even though commands require that header and patch routes exist (`backend/src/middleware/validateOrigin.js:25-39`; `backend/src/modules/tickets/ticket.routes.js:40`; `backend/src/modules/assets/assets.routes.js:14`). Use a same-origin `/api` proxy/deployment for Step 2. A separately hosted browser frontend requires the backend CORS allowlists to add `Idempotency-Key` and `PATCH`.

### Pagination

There are two actual pagination shapes; do not normalize by guessing:

- Tickets, timelines, approvals, attachments, worklogs, and assets: `{ page, limit, total, totalPages }`. Defaults are page `1`, limit `25`; maximum limit `100` (`backend/src/modules/tickets/ticket.validation.js:99-109,170-180`).
- Notifications and audit: `{ page, limit, total, pages }` (`backend/src/modules/notifications/notification.service.js:50-60`; `backend/src/modules/audit/audit.service.js:147-169`).

Dashboard, reports, health, sessions, and access grants are not paginated. Keep list filters in the browser URL and send only documented query keys.

### Mutation requirements

- Every ticket create/patch/command/comment/worklog, approval decision/reroute, attachment upload, and asset create/patch/command requires `Idempotency-Key`. Valid keys contain 8–128 letters, digits, `. _ : -` (`backend/src/shared/database/idempotency.js:6-31`). Reuse a key only for the identical normalized input. Reuse with changed input returns `409 IDEMPOTENCY_KEY_REUSED`; successful replay sets `Idempotency-Replayed: true` (`backend/src/shared/database/idempotency.js:39-49`; `backend/src/shared/database/command.js:23-59`).
- Ticket and asset mutations other than creation require non-negative integer `expectedVersion`. Approval decision/reroute uses the ticket version. On `409 STALE_TICKET_VERSION`, `STALE_ASSET_VERSION`, `INVALID_TICKET_TRANSITION`, `APPROVAL_CONFLICT`, `ASSET_STATE_CONFLICT`, `STALE_SLA_CLOCK`, or generic `CONFLICT`, refetch affected detail/timelines, keep the user's draft, show a persistent conflict notice, and require an explicit new submission with a new key.
- Access-grant create/revoke, session revoke, logout, password change, and notification mark-read require CSRF but not an idempotency key. Do not generically retry them. Grant revoke and mark-read are server-idempotent in effect; grant create can return `409 ACTIVE_GRANT_EXISTS`.
- Transactional commands can return `503 TRANSACTIONS_UNAVAILABLE` if MongoDB is not a replica set (`backend/src/shared/database/transaction.js:41-58`). Treat as service unavailable, not a validation problem.

## Screen and action matrix

### Authentication and account security

All auth success objects use:

```text
data: {
  user: { id, displayName, email, employeeNumber, phone, role,
          accountStatus, mustChangePassword },
  organization: { id, name, organizationType, timezone, supportEmail },
  department: { id, code, name, isActive },
  permissions: [{ id, capability, scope }],
  session: { id, client, createdAt, lastSeenAt, idleExpiresAt,
             absoluteExpiresAt, isCurrent },
  csrfToken
}
```

Evidence: `backend/src/modules/auth/auth.service.js:43-118`; `backend/src/modules/auth/session.service.js:170-197`.

| Capability / frontend location | API, inputs, and response | Authorization and behavior | Errors and frontend behavior | Status / evidence |
| --- | --- | --- | --- | --- |
| Sign in `/sign-in` | `POST /auth/login`; exact JSON `{ email, password }`. Email non-empty, max 320 characters and normalized lowercase; password non-empty, max 1024 characters. Returns the auth object above and sets the session cookie. No CSRF/idempotency. | Public. Origin validation and login rate limiting apply. | `401 INVALID_CREDENTIALS`: generic form error. `429 LOGIN_RATE_LIMITED`: disable submit and honor `Retry-After`. `403 ORIGIN_NOT_ALLOWED`: deployment error. | **Available** — static + recorded runtime. `backend/src/modules/auth/auth.routes.js:20-27`; `backend/src/modules/auth/auth.controller.js:18-38`; `backend/src/modules/auth/auth.service.js:121-202`; `backend/src/middleware/rateLimit.js:33-84`; `backend/test/auth.integration.test.js:43` |
| Session bootstrap `/` and all protected routes | `GET /auth/me`; no query/body. Returns the auth object and current session-derived CSRF token. | Requires a valid active, non-expired session. This route remains allowed when `mustChangePassword` is true. Every request reloads user, organization, department, and active role-compatible grants. | `401 AUTHENTICATION_REQUIRED`: clear all private state/query caches, route to sign-in, retain only a validated internal return path. | **Available** — static + recorded runtime. `backend/src/modules/auth/auth.routes.js:27-30`; `backend/src/middleware/authenticate.js:67-176` |
| Logout, header/profile action | `POST /auth/logout`; no required body; CSRF required; returns `204` and clears cookie. | Authenticated, including forced-password-change state. Revokes the current server session. | On any result, clear local private state. On a network error show that server logout could not be confirmed; a later `401` is authoritative. | **Available** — `backend/src/modules/auth/auth.routes.js:29`; `backend/src/modules/auth/auth.controller.js:40-43`; `backend/src/modules/auth/auth.service.js:205-220` |
| Forced password change `/change-password` and voluntary change `/security` | `POST /auth/change-password`; exact JSON `{ currentPassword, newPassword }`; both required. New password is 12–128 Unicode characters and at most 1024 UTF-8 bytes. Returns a fresh auth object and replacement cookie/CSRF token. | Authenticated and intentionally allowed while forced change is pending. Atomically changes password, increments session version, revokes all sessions, and creates one replacement session. | Inline: `CURRENT_PASSWORD_INCORRECT`, `PASSWORD_POLICY_VIOLATION`, `PASSWORD_REUSE_NOT_ALLOWED`. `409 ACCOUNT_CHANGED`: clear state and sign in again. After success replace auth state/CSRF and clear user query caches. | **Available** — `backend/src/modules/auth/auth.routes.js:42-46`; `backend/src/modules/auth/auth.controller.js:69-97`; `backend/src/modules/auth/auth.service.js:256-374`; `backend/src/modules/users/password.service.js:11-15,65-87` |
| Active sessions `/security` | `GET /auth/sessions`; no query/body. Returns `{ data: { sessions: [{ id, client, createdAt, lastSeenAt, idleExpiresAt, absoluteExpiresAt, isCurrent }] } }`. | Authenticated and password change complete; only caller-owned, current-version, active sessions. | `403 PASSWORD_CHANGE_REQUIRED`: route to forced change. `401`: sign out. | **Available** — `backend/src/modules/auth/auth.routes.js:31-35`; `backend/src/modules/auth/auth.controller.js:50-53`; `backend/src/modules/auth/session.service.js:170-197` |
| Revoke a session `/security` | `DELETE /auth/sessions/:sessionId`; path `sessionId`; no JSON body; CSRF required; `204`. Revoking current session clears its cookie. | Only caller-owned active sessions. | `404 SESSION_NOT_FOUND`: remove stale row/refetch. If current session, clear state and sign in. | **Available** — `backend/src/modules/auth/auth.routes.js:36-41`; `backend/src/modules/auth/auth.controller.js:55-67`; `backend/src/modules/auth/auth.service.js:229-253` |
| Invitation, activation, forgot/reset password, user CRUD | No API. | None. | Do not render working forms or hard-code accounts. | **Missing** — registered application mounts contain no user/account routes (`backend/src/app.js:50-61`). |

Forced-change routing rule: when `/auth/me` returns `mustChangePassword: true`, permit only `/change-password` and logout. All sessions and business routes apply `requirePasswordChangeComplete` and return `403 PASSWORD_CHANGE_REQUIRED` (`backend/src/middleware/authenticate.js:179-190`).

### Dashboard and reports

| Capability / frontend location | API, parameters, and response | Authorization / scope | Errors and UI | Status / evidence |
| --- | --- | --- | --- | --- |
| Dashboard `/` | `GET /dashboard?from&to&departmentId`; RFC 3339 `from/to` with explicit offsets, `from < to`, max 366 days; defaults to trailing 30 calendar days ending now. Response `{ data: { dashboard: { generatedAt, timezone, period:{startInclusive,endExclusive}, appliedFilters:{departmentId}, units:{durations:"seconds",serviceDurations:"business_seconds"}, sections } } }`. | Authenticated, password complete. Optional department must be caller's own or inside a current `support`, `department_supervise`, `ticket_triage`, or `asset_manage` scope. Sections are role/scope-shaped: administrator `administration`; non-admin `personal`; technician may get `technician`; supervisor may get `departmentSupervision` and/or `triage`. Never invent missing sections. | `400 VALIDATION_ERROR`: reject filter. `403 DEPARTMENT_FILTER_FORBIDDEN`: remove filter/show scope message. Render section-level empty/error states. | **Available** — static + Step 11 runtime record. `backend/src/modules/dashboard/dashboard.controller.js:5-16`; `backend/src/modules/dashboard/dashboard.service.js:109-200,252-360`; `backend/src/modules/reporting/reporting.validation.js:28-45`; `backend/test/summaries.integration.test.js:21` |
| Overview report `/reports` | `GET /reports/overview` with the same filters. Response `{ data:{ report:{ generatedAt, timezone, period, appliedFilters, cohortDefinitions, backlog, serviceLevels, reopenings, workEffort, recurringEquipmentIssues, assetAccountability } } }`. | Any authenticated, password-complete account; content is filtered through current ticket/asset access. Administrator is not global reporting access. Work effort is `{available:false,totalSeconds:null,entries:null}` without internal-ticket capability. | Preserve returned units/cohorts/nulls. `percentage:null` means “No data,” not 0%. Show `reconciliationRequired`. No client SLA recomputation. | **Available** — static + Step 11 runtime record. `backend/src/modules/reporting/reporting.routes.js:14-16`; `backend/src/modules/reporting/reporting.service.js:25-32,276-309,516-548`; `backend/src/modules/reporting/reporting.access.js:19-48`; `backend/test/summaries.integration.test.js:21` |
| Trend charts/export | No time-series or export endpoint. Returned `byStatus`, `openByPriority`, distributions, and aggregate counts may be rendered as accessible tables or simple charts with text equivalents. | Same as report. | No fake trend lines, CSV buttons, or export history. | **Missing** for trends/export; **Partial** for charts — aggregate widgets only. `backend/src/modules/reporting/reporting.service.js:75-106,527-548` |

Dashboard widget contract: personal provides active/waiting/confirmation counts, up to 10 recent resolutions and public updates, and up to 25 assigned assets; technician provides assigned/queue/resolved counts, up to 10 assigned work items with SLA due timestamps, and current overdue indicators; supervisor sections provide backlog, assigned approvals, aging, recurring equipment, due/breached work and workload distribution. Administrator provides health/account-status counts/configuration issue counts only. These are the only approved Step 2 widgets (`backend/src/modules/dashboard/dashboard.service.js:109-200,252-332`).

### Ticket collection, creation, and detail

Ticket list/detail serialization is `{ id, reference, title, description, type, urgency, impact, priority, status, category, slaCycleNumber, workStartedAt, assetSnapshots, followUpOf, approvalRequired, approvalStatus, currentApprovalRound, requester, requesterDepartment, assignee, location, service, submittedAt, firstResponseAt, resolution, closedAt, version, viewer, createdAt, updatedAt }`; detail also adds `slaCycles`. `viewer` is `STAFF`, `REQUESTER`, or `SUPERVISOR_PUBLIC` (`backend/src/modules/tickets/ticket.serializer.js:35-80`; `backend/src/modules/tickets/ticket.service.js:367-375`).

| Capability / frontend location | API, parameters / fields, response | Authorization / lookups | Errors and UI | Status / evidence |
| --- | --- | --- | --- | --- |
| My Tickets `/tickets` | `GET /tickets`; query allowlist: `status`, `type`, `from`, `to`, `search`, `page`, `limit`, `sort`. Status uses backend enum; type is `INCIDENT\|REQUEST`; search 2–100 chars over reference/title; `from/to` valid dates; sorts: `±submittedAt`, `±updatedAt`, `±reference`, `±priority`. Returns `{ data:{ tickets:[ticket], pagination:{page,limit,total,totalPages} } }`. | Returns union of caller-requested tickets and currently granted public/staff scope. Supervisor public access never exposes internal timelines. | `400 VALIDATION_ERROR`: keep filter UI and identify invalid value. Empty is a valid result. | **Available** — `backend/src/modules/tickets/ticket.routes.js:35`; `backend/src/modules/tickets/ticket.validation.js:122-167`; `backend/src/modules/tickets/ticket.policy.js:64-92`; `backend/src/modules/tickets/ticket.service.js:344-365`; `backend/test/operations.integration.test.js:36` |
| Technician queue `/queue` | `GET /queue` with the same query contract/response as tickets. | Only a `TECHNICIAN` with current department-applicable `support`; returns unassigned `NEW\|OPEN` work whose approval is `NOT_REQUIRED\|APPROVED`. Others get an empty collection, not a role error. | Empty queue is normal. Grant revocation must remove cached rows after refetch/next response. | **Available** — `backend/src/modules/tickets/ticket.routes.js:50-52`; `backend/src/modules/tickets/ticket.policy.js:94-113` |
| Create ticket `/tickets/new` | `POST /tickets`; exact JSON allows `serviceItemId`, `title`, `description`, `urgency`, optional `locationId`, `assetIds`, `primaryAssetId`, `followUpOfId`. Required: service item, title 10–150, description 20–5000, urgency `LOW\|MEDIUM\|HIGH`. Up to 20 unique asset ObjectIDs; primary must be among them. Returns `201 {data:{ticket}}`. CSRF + idempotency; no expected version. | Any authenticated password-complete active account creates for self/current department. Service/location/asset/follow-up relations are reauthorized. Required lookups: service catalog **missing**; department-valid locations **missing**; selectable assets available only after service ID; follow-up can use `/tickets`. | `422 SERVICE_ITEM_UNAVAILABLE`, `SLA_CONFIGURATION_UNAVAILABLE`, `LOCATION_UNAVAILABLE`, `ASSET_SELECTION_UNAVAILABLE`; `409 APPROVER_CONFIGURATION_REQUIRED` for approval-required service with no eligible configured approver. Keep draft. | **Partial** — endpoint works and is runtime-tested, but production form cannot discover service/location IDs. `backend/src/modules/tickets/ticket.validation.js:34-63`; `backend/src/modules/tickets/ticket.service.js:196-341`; `backend/src/modules/assets/assetSelection.service.js:52-85`; `backend/test/ticket.integration.test.js:57` |
| Ticket detail `/tickets/:ticketId` | `GET /tickets/:ticketId`; ObjectID-like path; no query/body. Returns `{data:{ticket}}` with safe fields and SLA cycles. | Requester; support access limited to assigned or eligible unassigned queue; department supervisor public; triage scoped. Inaccessible/invalid is `404 TICKET_NOT_FOUND`. Assignment alone does not replace active support grant. | Use a shared missing-or-inaccessible state for 404. Render only fields returned for current identity. | **Available** — `backend/src/modules/tickets/ticket.routes.js:36-37`; `backend/src/modules/tickets/ticket.policy.js:64-145`; `backend/src/modules/tickets/ticket.service.js:86-95,367-375` |
| Edit title/description `/tickets/:ticketId` | `PATCH /tickets/:ticketId`; exact JSON `{ expectedVersion, title?, description?, reason? }`; at least title or description. Same length rules. Returns `{data:{ticket}}`. CSRF + idempotency + expected version. | Requester only while `NEW\|OPEN` and work has not started; scoped triage may edit active ticket and must provide reason. | `400 REASON_REQUIRED`; conflict rules above. Cross-origin PATCH is blocked by current CORS allowlist. | **Available** same-origin; **Partial** cross-origin. `backend/src/modules/tickets/ticketOperations.validation.js:4-31`; `backend/src/modules/tickets/ticketOperations.service.js:247-258` |

Ticket status enum is `NEW, OPEN, IN_PROGRESS, RESOLVED, CLOSED, WAITING_REQUESTER, WAITING_VENDOR, WAITING_APPROVAL, REJECTED, CANCELLED`; priorities `P1..P4`; resolution codes `FIXED, WORKAROUND, FULFILLED, NO_FAULT_FOUND` (`backend/src/modules/tickets/ticket.model.js:6-21`).

### Conversation, history, worklogs, and attachments

| Capability / frontend location | API and contract | Authorization / behavior | Errors and UI | Status / evidence |
| --- | --- | --- | --- | --- |
| Public replies and internal notes `/tickets/:ticketId` conversation | `GET /tickets/:ticketId/comments?page&limit` returns `{comments:[{id,author,visibility,kind,body,createdAt}],pagination}`. `POST` exact JSON `{ expectedVersion, body, visibility? }`; body 1–5000; visibility defaults `PUBLIC`, or `INTERNAL`. Returns `201 {data:{comment,ticket}}`. CSRF + idempotency + version. | Public: requester, assigned technician, triage, or department supervisor. Internal: only `canViewInternal` (triage, assigned valid support tech, or eligible unassigned queue support); non-staff list filters internal rows server-side. A requester public reply while waiting resumes the ticket. | 404 hides inaccessible internal content. Conflict refetches detail/comments. Label internal composer and notes unmistakably; never merge internal/public visually. | **Available** — `backend/src/modules/tickets/ticket.routes.js:42-43`; `backend/src/modules/tickets/ticketOperations.validation.js:16-17,45,51-60`; `backend/src/modules/tickets/ticketOperations.service.js:72-76,351-373`; `backend/src/modules/tickets/ticket.service.js:378-398`; `backend/test/operations.integration.test.js:36` |
| Events/history | `GET /tickets/:ticketId/events?page&limit`; returns `{ events:[{id,type,actor,data,occurredAt}], pagination }`. | Same ticket access; non-internal viewers receive only `PUBLIC`/legacy-null events. Some operational reasons/evidence are intentionally internal. | Treat event `data` as event-specific display data; do not expose unknown fields blindly in a generic JSON dump. | **Available** — `backend/src/modules/tickets/ticket.routes.js:44`; `backend/src/modules/tickets/ticket.service.js:400-419`; `backend/src/modules/tickets/ticketOperations.service.js:460-474` |
| Worklogs | `GET /tickets/:ticketId/worklogs?page&limit` returns `{worklogs:[{id,authorId,start,end,durationSeconds,notes,createdAt}],pagination}`. `POST` exact JSON `{ expectedVersion,start,end,notes }`; RFC-style ISO timestamps with timezone, end after start, notes 1–5000. Returns `201 {data:{worklog,ticket}}`. CSRF + idempotency + version. | Read requires internal view. Create requires currently assigned technician with active support grant and ticket in `IN_PROGRESS\|WAITING_REQUESTER\|WAITING_VENDOR`. Department supervision alone has no access. | 404 for non-internal view; conflict behavior above. Display `durationSeconds` as server value. | **Available** — `backend/src/modules/tickets/ticket.routes.js:45-46`; `backend/src/modules/tickets/ticketOperations.validation.js:17,46-50`; `backend/src/modules/tickets/ticketOperations.service.js:374-391,479-498` |
| Attachment list/metadata/download | `GET /tickets/:ticketId/attachments?page&limit` → `{attachments:[metadata],pagination}`. `GET /attachments/:attachmentId` → `{data:{attachment}}`. Metadata: `{id,commentId,filename,mimeType,size,visibility,state,scanStatus,createdAt}`. `GET /attachments/:attachmentId/download` returns bytes with server `Content-Type`, `Content-Disposition`, and `nosniff`. | Parent ticket access; internal attachment and parent-comment visibility are rechecked. Files are never public storage URLs. | `404 TICKET_NOT_FOUND` for inaccessible metadata. `409 ATTACHMENT_NOT_READY`; `503 ATTACHMENT_UNAVAILABLE`. Fetch download as credentialed blob and use server filename. | **Available** — `backend/src/modules/attachments/attachment.routes.js:27-55`; `backend/src/modules/attachments/attachment.service.js:45-89,307-320` |
| Attachment upload | `POST /tickets/:ticketId/attachments`, multipart fields exactly once: `file`, `expectedVersion`, optional `visibility`, `commentId`. One nonempty PNG/JPEG/PDF, declared MIME/extension/signature must agree, max 5 MiB, sanitized filename ≤180; visibility default `PUBLIC`. Returns `201 {data:{attachment}}`. CSRF + idempotency + version. | Same discussion authorization as visibility; active ticket only (not resolved/terminal); max five including pending. Optional comment must belong to ticket and cannot make an internal parent public. The ticket version increments for reservation and again for finalization, while response omits ticket. **Always refetch ticket after success or terminal upload error.** | `413 FILE_TOO_LARGE`; `415 MULTIPART_REQUIRED\|INVALID_FILE_TYPE`; `400 INVALID_MULTIPART\|INVALID_FILE\|VISIBILITY_CONFLICT`; `409 ATTACHMENT_LIMIT\|ATTACHMENT_NOT_READY`; `422 ATTACHMENT_REJECTED`; `503 SCANNER_UNAVAILABLE\|ATTACHMENT_FINALIZATION_FAILED`. | **Available** — static + attachment runtime regressions. `backend/src/modules/attachments/attachment.validation.js:5-54`; `backend/src/modules/attachments/attachment.service.js:148-305`; `backend/VERIFICATION.md:223-228` |

There is no live chat, typing/presence, read receipt, WebSocket/SSE, or push contract. Conversation refresh/polling is a future decision; in-app notifications are background-delivered and fetched over HTTP.

### Ticket commands

Every row below is an action on the `/tickets/:ticketId` screen using `POST /tickets/:ticketId/{action}`, an exact JSON body, CSRF, `Idempotency-Key`, and `expectedVersion`; success is `200 {data:{ticket}}`. All recheck current account/session/grants inside the transaction (`backend/src/modules/tickets/ticket.routes.js:40-46`; `backend/src/modules/tickets/ticket.controller.js:83-90`; `backend/src/modules/tickets/ticketOperations.service.js:170-246`).

| Action / proposed UI | Allowlisted fields and transition | Authorization / lookup dependency | Important errors / UI | Status / evidence |
| --- | --- | --- | --- | --- |
| Triage | `/triage`: required `category` 1–80 and `impact LOW\|MEDIUM\|HIGH`; optional `urgency`, `priority P1..P4`, `reason`. Priority override needs reason. `NEW` becomes `OPEN`. | `SUPERVISOR` + current `ticket_triage` scope. Category must be in frozen service snapshot. No endpoint/serialized field supplies allowed categories. | `422 CATEGORY_UNAVAILABLE`, `400 REASON_REQUIRED`, conflicts. | **Partial** — command available/tested; category lookup missing. `backend/src/modules/tickets/ticketOperations.validation.js:32-37`; `backend/src/modules/tickets/ticketOperations.service.js:259-294` |
| Claim | `/claim`: only `{expectedVersion}`. Claims self; `NEW`→`OPEN`. | Current `TECHNICIAN` + support scope for original requester department; ticket unassigned and `NEW\|OPEN`; approval fulfilled. | `404` when outside scope; conflict when assigned/state changed. | **Available** — `backend/src/modules/tickets/ticketOperations.service.js:295-315`; `backend/src/modules/tickets/ticket.policy.js:115-119` |
| Assign/reassign/unassign | `/assignment`: `{expectedVersion, assigneeId, reason}`; `assigneeId` ObjectID or `null`; reason required. Unassigning active/waiting work moves to `OPEN` and closes pause. | Triage scope. Non-null assignee must be active technician with current support grant for original department. Eligible-technician lookup is missing. | `422 ASSIGNEE_UNAVAILABLE`; conflicts. | **Partial** — command available/tested; user lookup missing. `backend/src/modules/tickets/ticketOperations.validation.js:7,38,51-53`; `backend/src/modules/tickets/ticketOperations.service.js:295-315` |
| Start work | `/start`: `{expectedVersion}`; `OPEN`→`IN_PROGRESS`, sets first `workStartedAt`. | Currently assigned technician with active support grant; approval fulfilled. | Invalid state/approval → `409 INVALID_TICKET_TRANSITION\|APPROVAL_CONFLICT`. | **Available** — `backend/src/modules/tickets/ticketOperations.service.js:316-321` |
| Wait | `/wait`: `{expectedVersion,status,reason,nextStep}`; status `WAITING_REQUESTER\|WAITING_VENDOR`; reason and public next step 1–5000; adds public reply. | Assigned technician; only from `IN_PROGRESS`. `WAITING_REQUESTER` pauses resolution SLA. `WAITING_VENDOR` does **not** pause SLA. | Conflict; validation. Keep status labels explicit. | **Available** — `backend/src/modules/tickets/ticketOperations.validation.js:10,39,51-54`; `backend/src/modules/tickets/ticketOperations.service.js:322-338`; `backend/src/modules/service-levels/slaPause.model.js:21-47` |
| Resume | `/resume`: `{expectedVersion, dependencyUpdate?}`. Waiting→`IN_PROGRESS`; vendor wait requires update and adds public reply. | Assigned technician; only waiting states. | `400 DEPENDENCY_UPDATE_REQUIRED`; conflict. | **Available** — `backend/src/modules/tickets/ticketOperations.service.js:339-350` |
| Resolve | `/resolve`: `{expectedVersion,summary,resolutionCode}`; summary 1–5000; code listed above. Adds public resolution reply and ends current SLA cycle. | Assigned technician; only `IN_PROGRESS`; approval fulfilled. | Conflict. | **Available** — `backend/src/modules/tickets/ticketOperations.validation.js:14,44,51-58`; `backend/src/modules/tickets/ticketOperations.service.js:414-429` |
| Requester confirmation / close | Backend action is `/close`: `{expectedVersion,confirmationEvidence?}`; `RESOLVED`→`CLOSED`. | Requester or triage. Requester needs no evidence; triage must provide 1–5000 evidence. | `400 CONFIRMATION_REQUIRED`; conflict. Frontend label should be “Confirm resolution” for requester and “Close with evidence” for triage. | **Available** — `backend/src/modules/tickets/ticketOperations.validation.js:15`; `backend/src/modules/tickets/ticketOperations.service.js:430-438` |
| Cancel | `/cancel`: `{expectedVersion,reason}`; reason required; pending approval is superseded; cycle ends excluded. | Triage, or requester only before work while `NEW\|OPEN\|WAITING_APPROVAL`. | Conflict outside allowed state. | **Available** — `backend/src/modules/tickets/ticketOperations.service.js:392-413` |
| Reopen | `/reopen`: `{expectedVersion,reason,sameIssue?}`; opens a new SLA cycle and preserves prior resolution/cycles. | Requester or triage; only `RESOLVED`. Requester must set `sameIssue:true` and be within inclusive three-business-day calendar window. Triage is not constrained by that requester rule. | Conflict message directs requester to linked follow-up when different/late. | **Available** — `backend/src/modules/tickets/ticketOperations.validation.js:13,40-43`; `backend/src/modules/tickets/ticketOperations.service.js:439-459`; runtime evidence `backend/VERIFICATION.md:217-221` |

Terminal tickets are `CLOSED|REJECTED|CANCELLED` and cannot be mutated; create a linked follow-up instead (`backend/src/modules/tickets/ticket.policy.js:148-150`; `backend/src/modules/tickets/ticketOperations.service.js:230`). The backend does not return an action-hints array. Frontend visibility may be conservatively derived from `viewer`, status, assignment, role, and permissions for usability, but the backend remains authoritative.

### Approvals

| Capability / frontend location | API and contract | Authorization / lookups | Errors and UI | Status / evidence |
| --- | --- | --- | --- | --- |
| Approval inbox `/approvals` | `GET /approvals`; query `page`, `limit`, `status` (`PENDING\|APPROVED\|REJECTED\|SUPERSEDED`, default `PENDING`), `from`, `to` (ISO timestamps with timezone; both inclusive over `requestedAt`), `sort` (`±requestedAt`, `±decidedAt`). Returns `{approvals:[approval],pagination}`. Approval includes ids/status/times/note and safe ticket context including ticket `version`. | Current named approver only, must be a `SUPERVISOR` with current `department_supervise` or `ticket_triage` scope covering the requester department; self-approval excluded. | Empty is valid after grant revocation or reroute. | **Available** — `backend/src/modules/approvals/approvals.validation.js:22-58`; `backend/src/modules/approvals/approvals.service.js:33-113`; `backend/src/modules/approvals/approval.serializer.js:4-43`; `backend/test/approvals.integration.test.js:27` |
| Decide | `POST /approvals/:approvalId/decision`; exact `{ decision:"APPROVED"\|"REJECTED", expectedVersion, decisionNote? }`; rejection note required 1–2000; approved note optional/null. Returns `{data:{approval}}`. CSRF + idempotency. | Current named approver, current pending round, not requester; ticket/SLA cycle must still be current. | 404 hides unauthorized approval. `409 STALE_TICKET_VERSION\|APPROVAL_CONFLICT`; refetch inbox/ticket/history. | **Available** — `backend/src/modules/approvals/approvals.validation.js:5-12`; `backend/src/modules/approvals/approvals.service.js:114-204` |
| Ticket approval history `/tickets/:ticketId` | `GET /tickets/:ticketId/approvals?page&limit`; returns `{approvals:[approval],pagination}`; triage additionally receives supersede reason/by. | Requester sees all rounds; triage sees all; eligible named approver sees only their own rounds. | Unauthorized/invalid ticket is `404 APPROVAL_NOT_FOUND` or ticket 404. | **Available** — `backend/src/modules/approvals/approvals.service.js:290-315`; serializer above. |
| Manual reroute `/tickets/:ticketId` | `POST /tickets/:ticketId/approval-reroutes`; exact `{ approverId, expectedVersion, reason }`, reason 1–2000. Returns `{data:{approval}}`. CSRF + idempotency. | Triage only. Candidate must be active supervisor, not requester, with covering supervision/triage grant. Eligible-approver lookup is missing. | `422 APPROVER_UNAVAILABLE\|APPROVER_UNCHANGED`; version/approval conflicts. | **Partial** — command available/tested; lookup missing. `backend/src/modules/approvals/approvals.validation.js:14-20`; `backend/src/modules/approvals/approvals.service.js:214-289` |
| Configured fallback | At ticket creation the server tries department designated approver, then organization backup, excluding requester/ineligible accounts. There is no separate fallback command or configuration read/write API. History records the created round. | Server-only configuration. | `409 APPROVER_CONFIGURATION_REQUIRED` keeps ticket uncreated. Show an administrator-contact message. | **Partial** — automatic fallback available; configuration UI missing. `backend/src/modules/approvals/approval.policy.js:21-62`; runtime evidence `backend/VERIFICATION.md:142-159` |

### SLA detail

| Capability / frontend location | API and response | Authorization / behavior | Errors and UI | Status / evidence |
| --- | --- | --- | --- | --- |
| Ticket SLA side panel `/tickets/:ticketId` | `GET /tickets/:ticketId/service-level`; no query. `{data:{serviceLevel:{ units:"seconds", viewer, timezone, currentCycle, cycles?, pauses?, priorityChanges?, breaches? }}}`. Metrics include status, budgets, elapsed/paused/remaining business seconds, completion/due timestamps, due-authoritative flag, and historical breach. | Same ticket access. Requester/supervisor-public gets requester-safe current cycle; internal staff gets complete cycles/pause/priority/breach history. | `409 SLA_RECONCILIATION_REQUIRED` can appear as cycle `{reconciliationRequired:true,reconciliationMessage}`; show “SLA data needs reconciliation,” not fabricated time. A paused resolution may have `dueAt:null` and `dueAtAuthoritative:false`. | **Available** — `backend/src/modules/service-levels/serviceLevels.service.js:16-84`; `backend/src/modules/service-levels/serviceLevel.serializer.js:1-34`; `backend/src/modules/service-levels/slaClock.service.js:98-204`; `backend/test/sla.integration.test.js:33` |

The response clock never pauses. Resolution pauses are implemented for `WAITING_APPROVAL` and `WAITING_REQUESTER`, not vendor wait. Reopening creates a new cycle with the original immutable service/policy/calendar snapshots. Use server timezone and seconds; do not run business-calendar math in the browser.

### Assets

Asset serialization is `{ id, assetTag, serialNumber, category, manufacturer, model, departmentId, locationId, shared, status, condition, version, viewer }`; manager view additionally includes purchase/warranty/cost/currency/creator/timestamps. Detail may add `currentCustody` for manager or `myAssignment` for own custodian (`backend/src/modules/assets/asset.serializer.js:3-28`; `backend/src/modules/assets/asset.service.js:215-227`). Categories, statuses, and conditions are defined at `backend/src/modules/assets/asset.model.js:5-7`. Unless a separate proposed route is named, asset actions below live on `/assets/:assetId`.

| Capability / frontend location | API, fields, response | Authorization / lookups | Errors and UI | Status / evidence |
| --- | --- | --- | --- | --- |
| Inventory / my assets `/assets` | `GET /assets`; query `page`, `limit`, `search` (1–120; tag/serial), `departmentId`, `category`, `status`. Returns `{assets,pagination}` sorted by tag. | Union of current custody plus scoped `asset_manage`, technician support, or department supervision. `viewer` is `OWN\|SCOPED\|MANAGER`; financial/creator data only for manager. Administrator gets no automatic asset access. | Empty is valid. Do not derive own assets from a broad client collection—the server already scopes it. | **Available** — `backend/src/modules/assets/asset.validation.js:57-66`; `backend/src/modules/assets/asset.policy.js:3-29`; `backend/src/modules/assets/asset.service.js:229-267`; `backend/test/operations.integration.test.js:36` |
| Selectable assets for new ticket | `GET /assets/selectable?serviceItemId&locationId?&page&limit&search?&departmentId?&category?&status?`; service ObjectID required. Returns safe snapshots `{assetId,assetTag,category,model,departmentId,locationId,primary}` plus pagination. | Applies frozen/current service asset policy to caller's own or shared department assets. Requires discoverable service ID first, which is missing. | `422 SERVICE_ITEM_UNAVAILABLE\|LOCATION_UNAVAILABLE`. | **Partial** — endpoint available, blocked upstream by service lookup. `backend/src/modules/assets/assets.routes.js:12`; `backend/src/modules/assets/assetSelection.service.js:7-60` |
| Asset detail `/assets/:assetId` | `GET /assets/:assetId` → `{data:{asset}}`. | Same own/scoped/manager access. Invalid/inaccessible `404 ASSET_NOT_FOUND`. | Render only returned representation. | **Available** — `backend/src/modules/assets/assets.routes.js:13`; `backend/src/modules/assets/asset.service.js:26-35,215-227` |
| Create asset `/assets/new` (proposed manager subroute) | `POST /assets`; exact fields: required `assetTag` (1–80, uppercased), `category`, `departmentId`; optional serial/manufacturer/model, nullable `locationId`, `shared`, condition, `purchaseDate`, `warrantyEndDate`, decimal-string `purchaseCost`, uppercase 3-letter currency. Returns `201 {data:{asset}}`. CSRF + idempotency. | Current `asset_manage` scope over department. Department/location lookup endpoints are missing. | `422 DEPARTMENT_UNAVAILABLE\|LOCATION_UNAVAILABLE`; duplicate tag/serial may surface `409 CONFLICT`; warranty-before-purchase `400`. | **Partial** — endpoint works; form lookups missing. `backend/src/modules/assets/asset.validation.js:5-55`; `backend/src/modules/assets/asset.service.js:79-124` |
| Edit asset `/assets/:assetId` | `PATCH /assets/:assetId`; exact `{expectedVersion, ...descriptiveFields, reason?}` with at least one descriptive field. Same field validation. Returns `{data:{asset}}`. CSRF + idempotency. | Manager scope over current department; changing department also needs target-department manage scope and reason; blocked after any custody history. Department/location lookups missing. | `400 REASON_REQUIRED`; `409 STALE_ASSET_VERSION\|ASSET_STATE_CONFLICT`; cross-origin PATCH CORS defect. | **Partial** — backend available, lookups/cross-origin gap. `backend/src/modules/assets/asset.service.js:125-169` |
| Assign custody | `POST /assets/:assetId/assign`; `{expectedVersion,custodianId,locationId?}`. | Manager. Asset must be usable `AVAILABLE`. Custodian must be active `EMPLOYEE` in asset department. User/custodian lookup missing; location lookup missing. | `422 CUSTODIAN_UNAVAILABLE`; state/version conflicts. | **Partial** — command available/tested; lookups missing. `backend/src/modules/assets/asset.validation.js:10,23,45`; `backend/src/modules/assets/assetCustody.service.js:53-85` |
| Return custody | `POST /assets/:assetId/return`; `{expectedVersion,condition,notes?}`; condition required. | Manager; current normal custody; asset and return condition must be `GOOD\|FAIR`. | `409 ASSET_STATE_CONFLICT`. Damaged/lost cases use lifecycle command instead. | **Available** — `backend/src/modules/assets/assetCustody.service.js:86-92` |
| Lifecycle | `POST /assets/:assetId/state`; `{expectedVersion,action,reason,reference?,ticketId?,condition?}`. Actions: `SEND_FOR_REPAIR`, `COMPLETE_REPAIR`, `MARK_LOST`, `RECOVER`, `RETIRE`. Reason always (1–5000); loss/retire reference (1–250); repair ticket ObjectID; completion/recovery condition. | Manager. Repair ticket must be an accessible active ticket already linked to asset. Use `GET /assets/:id/tickets` as the real candidate source; no separate search. | State conflicts; `404 TICKET_NOT_FOUND` for invalid repair link. | **Available** with bounded linked-ticket lookup — `backend/src/modules/assets/asset.validation.js:47-53`; `backend/src/modules/assets/assetCustody.service.js:93-143` |
| Custody/events/linked tickets | `GET /assets/:assetId/custody\|events\|tickets?page&limit`. Keys match kind plus pagination. Custody includes snapshots/actors/times/return data; events include safe data; tickets include id/reference/title/status. | Custody/events require manager. Tickets use current ticket access; own viewer is additionally limited to caller-requested tickets. Event ticket IDs are redacted if ticket access is absent. | `404 ASSET_NOT_FOUND` for unauthorized history. | **Available** — `backend/src/modules/assets/assets.routes.js:16`; `backend/src/modules/assets/asset.service.js:269-332`; `backend/src/modules/assets/asset.serializer.js:41-53` |

### Notifications

| Capability / frontend location | API and response | Authorization / behavior | Errors and UI | Status / evidence |
| --- | --- | --- | --- | --- |
| Notification menu/page `/notifications` | `GET /notifications?page&limit&state`; state `all\|read\|unread`, default all. Returns `{notifications:[{id,eventType,title,resource:{type,id,link?},metadata,deliveredAt,readAt}],pagination:{page,limit,total,pages},unreadTotal}`. | Current recipient only. Every row is reauthorized against current account/grants/resource; revoked rows are suppressed. | Empty is valid. No realtime API: refetch on focus/navigation or bounded polling only if later approved. The returned `resource.link` is an API path (`/api/v1/tickets\|assets/:id`); route internally from `resource.type/id`, do not navigate the SPA to the raw API link. | **Available** — `backend/src/modules/notifications/notification.validation.js:3-28`; `backend/src/modules/notifications/notification.service.js:29-61`; link construction `backend/src/modules/notifications/notificationAuthorization.service.js:149-155`; runtime record `backend/VERIFICATION.md:63-69` |
| Mark read | `POST /notifications/:id/read`; body absent or exact `{}`; CSRF required; no idempotency key. Returns `{data:{notification}}`. | Owned and still authorized notification only; repeated call returns same read state. | `404 NOTIFICATION_NOT_FOUND`: remove/refetch. | **Available** — `backend/src/modules/notifications/notification.controller.js:14-20`; `backend/src/modules/notifications/notification.service.js:64-82` |

### Administration

| Capability / frontend location | API and response | Authorization / lookups | Errors and UI | Status / evidence |
| --- | --- | --- | --- | --- |
| Access grants `/admin/access-grants` | `GET /admin/access-grants`; rejects all query keys; returns `{data:{accessGrants:[{id,capability,recipient,scope,grantedBy,revokedBy,revokedAt,isActive,alreadyRevoked?,createdAt,updatedAt}]}}`. `POST` exact required `{userId,capability,departmentId}`: user ID nonempty string max 64 then valid ObjectID, capability nonempty max 80 and enumerated, department valid ObjectID string or explicit `null`; returns `201`. `POST /:grantId/revoke`, no body or `{}`, returns updated grant. Mutations CSRF; no idempotency. | `ADMINISTRATOR` only. Capabilities: `support` technician/department required; `department_supervise` supervisor/department required; `ticket_triage` supervisor/org or department; `asset_manage` technician or supervisor/org or department. Recipient and department lookups are missing. Revoke-and-create; no edit. | Map validation codes: `INVALID_CAPABILITY`, `INVALID_CAPABILITY_FOR_ROLE`, `DEPARTMENT_SCOPE_REQUIRED`, `RECIPIENT_INACTIVE`, not-found codes, `ACTIVE_GRANT_EXISTS`. Refetch identity/affected lists after mutation. | **Partial** — list works; production create form blocked by user/department lookups. `backend/src/modules/access/access.controller.js:18-72`; `backend/src/modules/access/accessGrant.model.js:12-36`; `backend/src/modules/access/access.service.js:39-182`; `backend/test/access.integration.test.js:40` |
| Audit explorer `/admin/audit` | `GET /admin/audit`; query `from`, `to` (exclusive end, max 366 days), `action`, `actorId`, `entityType`, `source`, `page`, `limit`, `sort=asc\|desc`. Actions: `LOGIN`, `LOGOUT`, `SESSION_REVOKED`, `PASSWORD_CHANGED`, `AUTHENTICATION_REJECTED`, `ACCESS_GRANT_CREATED`, `ACCESS_GRANT_REVOKED`; sources `AUTHENTICATION\|ACCESS_ADMINISTRATION`; entity types `USER\|SESSION\|ACCESS_GRANT\|DEPARTMENT`. Returns safe `{events,pagination:{...,pages},ordering}`. | `ADMINISTRATOR` only; organization-scoped. Returned actor/entity names are already safe. Do not perform visibility-expanding lookups. Actor lookup is missing, so filter can only use IDs learned from returned records unless backend adds authorized search. | Invalid combination/query → `400 VALIDATION_ERROR`. | **Partial** — available for authentication/access audit, not operational ticket/asset audit; actor picker lookup missing. `backend/src/modules/audit/audit.validation.js:4-73`; `backend/src/modules/audit/audit.service.js:113-169`; `backend/test/summaries.integration.test.js:21` |
| Operational health `/admin/health` | `GET /admin/health`; no query/body. Returns `{data:{status,checkedAt,components,database,worker,delivery,outbox,slaScheduler,cleanup,storage,backup}}`. Component states include `healthy`, `degraded`, `unavailable`, `unknown`, `not-configured`; fields include diagnostic codes, timestamps, ages/counts/evidence where applicable. | `ADMINISTRATOR` only. This is evidence display, not a repair API. | Preserve unknown/not-configured; never convert them to healthy. A database-level outage may prevent this authenticated route from responding at all; the public `/health` is only basic liveness. | **Available** — `backend/src/modules/health/health.routes.js:11-14`; `backend/src/modules/health/health.service.js:38-162`; `backend/src/modules/health/operationsEvidence.service.js:15-151`; `backend/test/summaries.integration.test.js:21` |
| Account, department, location, service, calendar, SLA settings | No CRUD/read routes. Dashboard has counts only; models and seed scripts are not frontend contracts. | None. | Omit or show clearly disabled roadmap links. | **Missing** — route mounts `backend/src/app.js:50-61`. |

## Lookup dependency register

Production forms must present authorized real choices; no IDs may be hard-coded.

| Needed lookup | Current closest API | Exact dependency |
| --- | --- | --- |
| Active service catalog for requester, including service type, approval flag, asset policy, and allowed triage categories | None. Ticket detail exposes only selected `{id,code,name}`; selectable assets requires a service ID. | Add authorized service-item list/detail endpoint. It must return stable IDs and form-safe configuration, including category choices and whether location/assets/approval apply. |
| Active locations for caller department / selected asset department | None. Existing ticket/asset detail only returns an already-selected location or ID. | Add organization/department-scoped active location lookup, with department relationship and code/name/building/room. |
| Departments caller may filter/manage | `/auth/me` returns caller department; access-grant list returns departments already used. | Add authorized department lookup constrained to the action: reporting filters, grant scopes, and asset-manage scopes. |
| Eligible support assignees | None. | Add ticket/department-specific eligible technician lookup using the same active support-grant rule as `eligibleAssignee`. |
| Eligible approval reroute candidates | None. | Add ticket-specific eligible supervisor lookup using `eligibleApprover`, excluding requester/current approver. |
| Eligible custodians | None. | Add asset/department-specific active employee lookup. |
| Access-grant recipients / audit actors | None. | Add administrator-authorized user search with minimal fields (`id`, display name, role, status, department); filter role/status server-side. |
| Selectable ticket assets | `GET /assets/selectable` | Implemented, but only usable after service discovery. |
| Repair tickets for an asset | `GET /assets/:assetId/tickets` | Implemented and safe; use returned active linked tickets as candidates. |

## Session, CSRF, and access-grant lifecycle

- Cookie name is configurable (default `it_help_desk_session`), host-only (no `Domain` attribute), path `/api/v1`, `HttpOnly`, `SameSite` configurable (default `Lax`), `Priority=High`, and `Secure` required in production. Defaults are 30-minute sliding idle expiry and 168-hour absolute expiry (`backend/src/config/env.js:65-118`; `backend/src/config/session.js:3-17`; `backend/src/modules/auth/session.service.js:129-167`). JavaScript never reads the raw token.
- Acquire CSRF from successful login or `/auth/me`. The token is an HMAC of the raw session token and is stable for that session. It rotates when login or password change creates a new session; logout/revoke clears the session. Keep it only in memory (`backend/src/modules/auth/session.service.js:53-61,93-126`; `backend/src/modules/auth/auth.service.js:191-202,363-374`).
- Authentication slides idle expiry on every successful authenticated request. Revoked/expired/disabled/version-mismatched sessions are revoked where appropriate, cookie-cleared, and answered `401 AUTHENTICATION_REQUIRED` (`backend/src/middleware/authenticate.js:67-139`).
- `/auth/me` and normal request authentication reload active grants. Business mutations call `currentAccess` again inside their transactions and after asynchronous file work, so a revoked grant or session takes effect without relogin (`backend/src/modules/access/currentAccess.service.js:7-63`; `backend/src/modules/attachments/attachment.service.js:245-285`). Refetch identity on window focus and after security/grant changes, but never assume frontend permission state is authoritative.

Authorization invariants:

- `ADMINISTRATOR` does not imply support, triage, supervision, reporting breadth, or asset access.
- Assignment does not replace a current `support` grant.
- `department_supervise` grants public ticket/asset scope only; it does not expose internal notes or worklogs.
- Notifications and attachment links do not grant resource access; the server reauthorizes the target.
- Cache clearing on logout/identity change is mandatory so internal data cannot cross identities.

## Filtering, time, and null semantics

- All filtering/sorting/pagination is server-side. Only documented query keys may be sent. There is no global search. Ticket search is reference/title; asset search is tag/serial; audit has enumerated filters.
- API timestamps are instants. Reporting ranges are `[startInclusive, endExclusive)`. Display in the returned organization/report timezone where context matters. Dashboard/report default “30 days” is 30 × 24 hours ending at server `asOf`, not a browser calendar-month calculation (`backend/src/modules/reporting/reporting.validation.js:28-45`).
- SLA elapsed/budget/remaining values are seconds of business time. Worklogs/health ages use seconds as labeled. Dashboard declares both duration units. Reports include cohort definitions, sample sizes, unanswered/unresolved/reconciliation counts, excluded cancelled/rejected outcomes, numerator, denominator, and a nullable percentage.
- Preserve `null` distinctly from zero and missing. Examples: no attainment denominator → `percentage:null`; unavailable work effort → null totals; a paused resolution due time may be null; unknown health evidence is not healthy.

## Global error policy

| HTTP / codes | Deskflow behavior |
| --- | --- |
| `400` validation and reason/password codes | Show field-level error where the code maps to a field; otherwise a form summary. Preserve draft. |
| `401 AUTHENTICATION_REQUIRED` | Cancel private requests, clear auth/query/private UI state, sign in. |
| `403 PASSWORD_CHANGE_REQUIRED` | Route to `/change-password`; retain no business screen. |
| `403 CSRF_VALIDATION_FAILED` | Refetch `/auth/me` once to reacquire the current session CSRF only when the session is otherwise valid; do not replay the mutation automatically. |
| Other `403` | Show authorization message; optionally refetch identity. Do not reveal resource details. |
| Resource `404` | Shared “missing or inaccessible” presentation; remove stale notification/list link. |
| `409` version/workflow/approval/asset/SLA conflict | Refetch affected resources, display persistent conflict, require review and a new submission/key. Never silently replay with a new version. |
| `413/415/422` | Specific upload or relationship/choice feedback. Keep safe draft/file selection where browser permits. |
| `429` | Disable login temporarily and honor `Retry-After`. |
| `503` | Service/scanner/storage/transaction unavailable state; safe retry only after user action and with the same key/body when it is an exact transport retry. |
| Unexpected `5xx` | Plain failure with `requestId`; no sensitive request logging. |

## Reconciled plan decisions

- Keep React 19, Vite 8, and JavaScript/JSX (`frontend/package.json:1-25`). No application dependencies are installed in Step 1.
- `/change-password` is the verified forced-change browser route. `/security` hosts voluntary password change and sessions.
- New-ticket, assignment, reroute, asset create/edit/assign, and access-grant create screens are **not production-complete** until their specific lookup dependencies exist.
- Assets do support authorized own/scoped/manager inventory; an extra client-derived “my assets” filter is unnecessary.
- Audit explorer is not a general operational audit log; it currently exposes only authentication and access administration.
- Approval fallback is server-side creation behavior, not a separate inbox action.
- Global search, live chat/realtime delivery, trend-series charts, exports, knowledge base, satisfaction, user management, and master-data settings remain explicit backend dependencies.

## Step 4 frontend client conventions

The shared implementation lives in `src/shared/api`. Feature code imports the
singleton `httpClient`; tests may create an isolated client with
`createHttpClient({ baseUrl, fetchImpl })`.

```js
const result = await httpClient.get('/tickets', {
  query: apiSearchParams(filters, FILTER_DEFINITIONS.tickets),
  signal,
})
```

- Every request uses the validated public API base URL, sends
  `credentials: "include"`, and defaults to `Accept: application/json`.
- JSON bodies are serialized once and receive `Content-Type: application/json`.
  `FormData` never receives a client-supplied content type, so the browser owns
  the multipart boundary. `204` and `205` resolve to `null`.
- JSON success envelopes are unwrapped to their `data` member without changing
  collection pagination. Callers that need request correlation or replay data
  use `includeMeta`; authenticated downloads use `responseType: "blob"` and
  receive `{ blob, filename, contentType, meta }`.
- Download filenames come from `Content-Disposition` and are stripped of path
  separators and control characters before UI code may save them.
- Protected state-changing requests obtain `X-CSRF-Token` only from the
  in-memory auth integration. Login opts out explicitly. No cookie, CSRF token,
  permission decision, or idempotency key is persisted in browser storage.
- A protected `401` notifies the future AuthProvider through
  `subscribeToSessionExpiry`. `clearPrivateClientState` cancels protected
  requests, removes only private query families, clears pending mutations, and
  clears the in-memory CSRF token. Step 5 owns redirects and session screens.

`ApiError` normalizes HTTP status, backend code, safe message, request ID,
validation details, and parsed `Retry-After`. Authorization/not-found/server
messages are intentionally generic; validation and verified domain messages
remain available. Abort errors pass through unchanged and are never read
retries. Query reads retry at most once, and only for network failures or
`500`, `502`, `503`, and `504`; mutations never retry automatically.

Query keys are hierarchical and cover identity, dashboards, tickets and their
timelines/SLA, assets, approvals, notifications, reports, access grants, audit,
and health. Keys reject secret-bearing fields and fingerprint search text so
raw free text is not stored in the cache key. The cache is memory-only.

URL helpers use capability-specific allowlists and canonical ordering. Invalid,
repeated, or unsupported browser URL values are reported and normalized;
feature API calls reject unresolved issues. A non-page filter change resets
`page` to `1`. Standard `{ totalPages }` and notification/audit `{ pages }`
payloads are normalized only when the caller supplies the verified variant,
and `total` remains distinct from `currentPageCount`.

### Versioned and idempotent commands

Feature mutations serialize the exact allowlisted command once, include the
current server `expectedVersion`, and obtain an in-memory key from
`createIdempotencyManager`. A pending command cannot be submitted twice. An
uncertain network/abort/server result retains the key for an exact-body retry;
changed input or a completed/definitive result uses a new key. A version conflict
is recognized only for the verified stale-version codes, refreshes the exact
detail key, and returns persistent `ConflictNotice` content. Workflow 409s are
handled separately. The user must review the refreshed version before creating
a new submission.

Ordinary mutation success invalidates only dependent detail/list families plus
the relevant dashboard, notification, SLA (under ticket detail), and report
families. It does not clear the complete cache. Feature modules use the
`features/<feature>/{api,queries,mutations,schemas}.js` convention; presentational
components never call the client.

### Attachment ordering

The frontend sends multipart fields `file`, `expectedVersion`, optional
`visibility`, and optional `commentId`, with CSRF and an idempotency key. The
backend first writes temporary content, transactionally reserves a `PENDING`
attachment and bumps the ticket version, scans the content, finalizes storage,
then transactionally marks it `READY` and bumps the ticket again. Scan or
finalization failures compensate the reservation and may change the ticket
version. Therefore every terminal upload result must refresh ticket detail and
attachments before another command. Retry an uncertain identical upload only
with the same file object/input and key; after `ATTACHMENT_NOT_READY`, refresh
metadata and use a new key only for a new reviewed command. Downloads remain
credentialed and the backend reauthorizes both metadata and content access.

Step 4 intentionally implements representative verified auth, health, ticket
read, attachment, and claim boundaries rather than speculative modules for
missing lookup contracts. The lookup, cross-origin CORS, and production service
dependencies recorded above remain unchanged.

## Step 5 frontend authentication conventions

`AuthProvider` owns the browser authentication lifecycle. The
`authKeys.me()` query remains the source of server identity data; the provider
derives `booting`, `authenticated`, `signedOut`, and `failure` states without
keeping a second user record. Initial `GET /auth/me` uses optional-auth client
behavior so an expected bootstrap `401` becomes signed-out state rather than a
protected-session-expiry event. Network and server failures remain a distinct,
retryable full-page error and are never interpreted as logout.

- The provider copies only the response `csrfToken` into the Step 4 in-memory
  integration. The token and session identity are never written to Web Storage,
  IndexedDB, URLs, query keys, or logs. The raw session token remains in the
  backend's HttpOnly cookie.
- Login sends exactly `{ email, password }` without CSRF. A successful response
  establishes the returned identity and CSRF token. `INVALID_CREDENTIALS`
  remains generic and form-local; `LOGIN_RATE_LIMITED` disables another attempt
  for the parsed `Retry-After` interval without disclosing account existence.
- Protected `401` notifications, confirmed logout, local logout after an
  unconfirmed server failure, current-session revocation, and account-change
  conflicts all synchronously invalidate the authenticated view, cancel
  protected requests, remove private queries, clear pending mutations, and
  clear in-memory CSRF. A transition generation prevents an older session from
  restoring state after a newer transition.
- Password change sends exactly `{ currentPassword, newPassword }`. On success,
  the rotated identity and CSRF response replace the old session only after
  previous private state is cleared. The forced-change route then returns to a
  validated intended application path. `ACCOUNT_CHANGED` ends local auth and
  requires a fresh sign-in.
- `/sign-in`, `/change-password`, and `/security` are the active account routes.
  Return destinations must be same-origin application paths, cannot be
  protocol-relative or contain backslashes, cannot target `/api`, and cannot
  loop through either authentication route (including trailing slashes).
- `RequireAuth` protects private routes. `RequirePasswordChangeComplete`
  redirects identities with `mustChangePassword` to `/change-password`; during
  that state only password change and logout are exposed. These are navigation
  aids only. Backend authorization and capability grants remain authoritative,
  and administrator role never implies an operational capability.
- `/security` renders only backend-returned safe session metadata. Revoking a
  non-current session refreshes the list. Revoking the current session clears
  local state and returns to sign-in. Password reset, activation, invitations,
  and account recovery remain unsupported because no verified routes exist.

The development component gallery remains outside the authentication provider
only in Vite development mode. It contains synthetic design-system fixtures and
is omitted from production routing and bundles; it is not an application-data
bypass.

