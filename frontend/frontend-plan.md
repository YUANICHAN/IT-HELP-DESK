# Frontend Plan: IT Help Desk and Asset Management System

## 1. Purpose

This document defines the frontend architecture, folder structure, security
model, delivery sequence, and quality standards for the IT Help Desk and Asset
Management System.

The current frontend is a minimal React 19 and Vite 8 project using plain
JavaScript and JSX. The backend is the source of truth for authentication,
authorization, workflow transitions, SLA calculations, audit data, and system
health. The frontend must present those decisions; it must never recreate or
override them.

## 2. Current state

### Frontend available today

- React 19 with `react-dom`.
- Vite 8 development and production builds.
- ESLint with React Hooks and React Refresh rules.
- Empty `App.jsx` and `index.css`; no existing application architecture needs
  to be migrated.
- Plain JavaScript. TypeScript is not planned unless the project explicitly
  adopts it later.

### Backend capabilities available today

- Opaque, server-side authentication sessions using an HttpOnly cookie.
- Session-bound CSRF protection for authenticated mutations.
- Current role and access-grant authorization on every request.
- Dashboard and authorized overview reporting.
- Ticket lists, queue, detail, workflow commands, comments, events, worklogs,
  attachments, approvals, and service-level detail.
- Asset inventory, details, custody, events, linked tickets, and lifecycle
  commands.
- Notification list and mark-read operation.
- Administrator access-grant administration, scoped audit explorer, and
  operational health.

### Backend gaps that affect frontend delivery

The following UI work must not pretend to be complete until corresponding
backend APIs exist:

- Discoverable service catalog, department, and location read endpoints needed
  to populate new-ticket and asset forms.
- User/account search needed for grant recipients, assignment, and custody
  selection.
- User invitation, activation, reset-password, and account-management APIs.
- Organization, department, location, service catalog, calendar, and SLA-policy
  administration APIs.
- Knowledge base, satisfaction feedback, CSV export, and export-history APIs.
- Full email delivery and frontend notification push/streaming.

Screens depending on these gaps should be omitted or shown as clearly disabled
roadmap items. IDs must never be hard-coded into production forms.

## 3. Architecture decisions

### 3.1 Architectural style

Use a feature-oriented React single-page application with four layers:

1. `app`: application bootstrap, providers, routing, layouts, and global policy.
2. `features`: business capabilities such as authentication, tickets, assets,
   approvals, reports, and administration.
3. `shared`: reusable UI primitives, HTTP infrastructure, hooks, formatting,
   and validation helpers with no business ownership.
4. `pages`: route-level composition. Pages coordinate feature components but
   contain little business or network logic.

Dependencies flow inward:

```text
pages -> features -> shared
  |         |
  +-------> app contracts where explicitly required
```

- `shared` must not import from `features` or `pages`.
- Features must not import another feature's private components. Shared
  cross-feature behavior moves to `shared`, while true workflow orchestration
  remains at page level.
- API calls live in feature API modules, not in presentational components.
- Route components should be lazy-loaded by feature boundary.

### 3.2 State ownership

Avoid a global Redux-style store initially. Split state by responsibility:

| State | Owner | Examples |
| --- | --- | --- |
| Server state | TanStack Query | tickets, dashboard, sessions, grants, assets |
| Authentication context | `AuthProvider` | current identity, CSRF token, boot state |
| URL state | React Router search params | page, filters, date range, sort |
| Form state | React Hook Form | login, ticket, comments, workflow dialogs |
| Local UI state | component hooks | open dialog, drawer, selected tab |

Do not duplicate query data in context. Do not persist permission-sensitive
query caches across browser reloads.

### 3.3 Proposed dependencies

Install dependencies only when implementation begins:

#### Runtime

- `react-router-dom`: routing and URL search parameters.
- `@tanstack/react-query`: request lifecycle, caching, invalidation, and retry
  control.
- `react-hook-form`: form state and accessible validation integration.
- `zod`: runtime validation for client configuration and critical API response
  boundaries.
- `@hookform/resolvers`: Zod integration for forms.
- `lucide-react`: consistent accessible icons.
- `date-fns`: display formatting only; backend remains authoritative for SLA and
  business-time calculations.

#### Development and testing

- `vitest` and `jsdom`.
- `@testing-library/react`, `@testing-library/user-event`, and
  `@testing-library/jest-dom`.
- `msw` for HTTP contract mocks.
- `playwright` for a small number of browser-level critical journeys.

Do not add a component framework until the product's visual direction is
approved. Start with accessible project-owned primitives and CSS variables.

## 4. Target folder structure

```text
frontend/
|-- .env.example
|-- eslint.config.js
|-- frontend-plan.md
|-- index.html
|-- package.json
|-- vite.config.js
|-- public/
|   |-- favicon.svg
|   `-- robots.txt
`-- src/
    |-- main.jsx
    |-- app/
    |   |-- App.jsx
    |   |-- AppProviders.jsx
    |   |-- router.jsx
    |   |-- routePaths.js
    |   |-- queryClient.js
    |   `-- ErrorBoundary.jsx
    |-- layouts/
    |   |-- AuthLayout.jsx
    |   |-- AppLayout.jsx
    |   |-- AppHeader.jsx
    |   |-- AppSidebar.jsx
    |   `-- MobileNavigation.jsx
    |-- pages/
    |   |-- SignInPage.jsx
    |   |-- ChangePasswordPage.jsx
    |   |-- DashboardPage.jsx
    |   |-- MyTicketsPage.jsx
    |   |-- QueuePage.jsx
    |   |-- NewTicketPage.jsx
    |   |-- TicketDetailPage.jsx
    |   |-- ApprovalsPage.jsx
    |   |-- AssetsPage.jsx
    |   |-- AssetDetailPage.jsx
    |   |-- NotificationsPage.jsx
    |   |-- SecurityPage.jsx
    |   |-- ReportsPage.jsx
    |   |-- AccessGrantsPage.jsx
    |   |-- AuditPage.jsx
    |   |-- SystemHealthPage.jsx
    |   |-- ForbiddenPage.jsx
    |   |-- NotFoundPage.jsx
    |   `-- ServiceUnavailablePage.jsx
    |-- features/
    |   |-- auth/
    |   |   |-- api.js
    |   |   |-- queries.js
    |   |   |-- schemas.js
    |   |   |-- AuthProvider.jsx
    |   |   |-- useAuth.js
    |   |   |-- RequireAuth.jsx
    |   |   |-- RequirePasswordChangeComplete.jsx
    |   |   |-- SignInForm.jsx
    |   |   |-- ChangePasswordForm.jsx
    |   |   `-- SessionList.jsx
    |   |-- dashboard/
    |   |   |-- api.js
    |   |   |-- queries.js
    |   |   |-- DashboardSections.jsx
    |   |   `-- SummaryCard.jsx
    |   |-- tickets/
    |   |   |-- api.js
    |   |   |-- queries.js
    |   |   |-- mutations.js
    |   |   |-- schemas.js
    |   |   |-- ticketPolicy.js
    |   |   |-- TicketTable.jsx
    |   |   |-- TicketFilters.jsx
    |   |   |-- TicketForm.jsx
    |   |   |-- TicketSummary.jsx
    |   |   |-- TicketConversation.jsx
    |   |   |-- TicketTimeline.jsx
    |   |   |-- TicketActions.jsx
    |   |   |-- ServiceLevelPanel.jsx
    |   |   |-- AttachmentList.jsx
    |   |   `-- dialogs/
    |   |       |-- AssignmentDialog.jsx
    |   |       |-- WaitingDialog.jsx
    |   |       |-- ResolutionDialog.jsx
    |   |       `-- ReopenDialog.jsx
    |   |-- approvals/
    |   |   |-- api.js
    |   |   |-- queries.js
    |   |   |-- ApprovalTable.jsx
    |   |   `-- ApprovalDecisionDialog.jsx
    |   |-- assets/
    |   |   |-- api.js
    |   |   |-- queries.js
    |   |   |-- mutations.js
    |   |   |-- AssetTable.jsx
    |   |   |-- AssetFilters.jsx
    |   |   |-- AssetSummary.jsx
    |   |   |-- CustodyHistory.jsx
    |   |   `-- dialogs/
    |   |       |-- AssignAssetDialog.jsx
    |   |       |-- ReturnAssetDialog.jsx
    |   |       `-- AssetStateDialog.jsx
    |   |-- notifications/
    |   |   |-- api.js
    |   |   |-- queries.js
    |   |   |-- NotificationList.jsx
    |   |   `-- NotificationMenu.jsx
    |   |-- reports/
    |   |   |-- api.js
    |   |   |-- queries.js
    |   |   |-- ReportFilters.jsx
    |   |   |-- BacklogSummary.jsx
    |   |   `-- ServiceLevelSummary.jsx
    |   `-- administration/
    |       |-- api.js
    |       |-- queries.js
    |       |-- accessGrants/
    |       |-- audit/
    |       `-- health/
    |-- shared/
    |   |-- api/
    |   |   |-- httpClient.js
    |   |   |-- apiError.js
    |   |   |-- queryKeys.js
    |   |   `-- idempotency.js
    |   |-- auth/
    |   |   |-- permissions.js
    |   |   `-- navigationPolicy.js
    |   |-- components/
    |   |   |-- Button.jsx
    |   |   |-- Input.jsx
    |   |   |-- Select.jsx
    |   |   |-- Textarea.jsx
    |   |   |-- Checkbox.jsx
    |   |   |-- Badge.jsx
    |   |   |-- Dialog.jsx
    |   |   |-- ConfirmDialog.jsx
    |   |   |-- DataTable.jsx
    |   |   |-- Pagination.jsx
    |   |   |-- DateRangeFields.jsx
    |   |   |-- Spinner.jsx
    |   |   `-- Skeleton.jsx
    |   |-- feedback/
    |   |   |-- EmptyState.jsx
    |   |   |-- ErrorState.jsx
    |   |   |-- FormError.jsx
    |   |   |-- ConflictNotice.jsx
    |   |   `-- ToastProvider.jsx
    |   |-- hooks/
    |   |   |-- useDebouncedValue.js
    |   |   |-- useDocumentTitle.js
    |   |   `-- useMediaQuery.js
    |   |-- utils/
    |   |   |-- date.js
    |   |   |-- duration.js
    |   |   |-- currency.js
    |   |   |-- pagination.js
    |   |   `-- strings.js
    |   `-- validation/
    |       `-- commonSchemas.js
    |-- styles/
    |   |-- reset.css
    |   |-- tokens.css
    |   |-- globals.css
    |   `-- utilities.css
    `-- test/
        |-- setup.js
        |-- server.js
        |-- handlers/
        |-- fixtures/
        `-- renderWithProviders.jsx
```

Use local component CSS modules only when a component needs substantial
isolated styles. Global styles should be limited to tokens, reset, typography,
layout utilities, and application defaults.

## 5. API and security architecture

### 5.1 Local and production topology

Prefer same-origin browser traffic:

```text
Browser -> /api/v1/* -> Express API
        -> /*         -> built React application
```

During development, configure Vite to proxy `/api` to
`http://127.0.0.1:5000`. This avoids separate-origin cookie surprises while the
backend's explicit origin checks remain enabled.

Proposed frontend environment:

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_APP_NAME=IT Help Desk
```

Validate environment values in `shared/config/env.js`. Never place database
credentials, CSRF secrets, API secrets, or private storage paths in `VITE_*`
variables because Vite embeds them in public browser assets.

### 5.2 HTTP client contract

Use one `fetch` wrapper with these rules:

- Base URL comes from validated public configuration.
- Always send `credentials: "include"`.
- Default `Accept: application/json`.
- Set `Content-Type: application/json` only for JSON bodies.
- Never set multipart `Content-Type` manually; allow the browser to add the
  boundary.
- Add `X-CSRF-Token` to authenticated state-changing requests.
- Add `Idempotency-Key` only to backend commands that require it.
- Parse the backend `{ data: ... }` success envelope.
- Convert `{ error: { code, message, requestId, details? } }` into a typed
  `ApiError` object.
- Show the request ID in unexpected-error UI so support can correlate logs.
- Do not automatically retry non-idempotent mutations unless the exact same
  idempotency key and body are reused.
- Do not log request bodies, cookies, CSRF values, passwords, attachments, or
  raw sensitive responses.

### 5.3 Authentication lifecycle

1. On application boot, call `GET /auth/me`.
2. While that request is pending, render a full-page boot skeleton rather than
   briefly displaying public or protected content.
3. A 200 response populates the in-memory identity and CSRF token.
4. A 401 response establishes the signed-out state and redirects protected
   routes to sign-in, retaining only a safe internal return path.
5. Login sends only email and password. The raw session token remains in the
   HttpOnly cookie and is never visible to React.
6. Keep the CSRF token only in memory. Do not use localStorage, sessionStorage,
   IndexedDB, a URL, logs, or analytics.
7. Logout clears the query cache and auth context even if navigation follows.
8. Password change replaces the session. Update the in-memory CSRF token from
   the response and clear user-specific query data.
9. If `mustChangePassword` is true, route the user only to password change,
   logout, and the minimum authentication recovery UI.

### 5.4 Authorization lifecycle

Frontend permission checks improve navigation and usability; they are not a
security boundary.

- Read `user.role` and `permissions` from `/auth/me`.
- Model grants as `capability + organization/department scope`.
- Do not treat `ADMINISTRATOR` as support, triage, supervision, or asset access.
- Do not treat assignment as a replacement for an active support grant.
- Department supervision permits public ticket views, not internal notes or
  worklogs.
- Hide or disable actions that are definitely unavailable, but accept that the
  backend can reject any stale UI decision after a grant or account change.
- On 401, clear all user state and return to sign-in.
- On 403, show an authorization message without revealing resource details.
- On resource 404, use the same not-found presentation whether it is missing or
  inaccessible.
- Refetch identity on window focus, after access-grant administration, and after
  account/security changes. Never cache permission decisions permanently.

## 6. Routing and navigation

### Public routes

| Route | Page | Availability |
| --- | --- | --- |
| `/sign-in` | Sign-in | Current backend |

Activation and reset-password routes should be added only after their backend
flows exist.

### Authenticated routes

| Route | Access intent |
| --- | --- |
| `/` | Role-aware dashboard |
| `/tickets` | Current user's authorized ticket collection |
| `/tickets/new` | Ticket creation; blocked until catalog/location reads exist |
| `/tickets/:ticketId` | Backend-authorized detail and actions |
| `/queue` | Current support-scope queue |
| `/approvals` | Current named approver inbox |
| `/assets` | Backend-authorized inventory |
| `/assets/:assetId` | Backend-authorized asset detail |
| `/notifications` | Current recipient's notifications |
| `/security` | Password and session management |
| `/reports` | Authorized overview report |
| `/admin/access-grants` | Administrator only |
| `/admin/audit` | Administrator only |
| `/admin/health` | Administrator only |

Navigation is generated from a single route metadata table and filtered through
the current identity/grants. Route guards use the same metadata so the sidebar
and router do not drift apart.

## 7. Query and mutation design

### 7.1 Query keys

Use hierarchical query keys:

```js
authKeys.me()
dashboardKeys.detail(filters)
ticketKeys.list(filters)
ticketKeys.detail(ticketId)
ticketKeys.comments(ticketId, filters)
ticketKeys.events(ticketId, filters)
assetKeys.list(filters)
assetKeys.detail(assetId)
notificationKeys.list(filters)
reportKeys.overview(filters)
adminKeys.audit(filters)
adminKeys.health()
```

Never include passwords, CSRF tokens, cookie values, descriptions, comments, or
attachment contents in query keys.

Recommended defaults:

- Queries: no automatic retry for 401, 403, or 404; one bounded retry for
  temporary network/5xx failures.
- Mutations: no generic automatic retry.
- Refetch important authorization-sensitive views on window focus.
- Clear the complete query cache on logout or identity change.
- Do not persist the query cache to browser storage.

### 7.2 URL-owned filters

Page, limit, search, status, type, department, date range, sorting, and read
state belong in URL search parameters. This supports refresh, back/forward,
bookmarks, and support reproduction.

Parse search parameters through an allowlist before sending them to the API.
Do not forward arbitrary URL keys or MongoDB-like operators.

### 7.3 Versioned commands

Ticket and asset commands use the latest server `version` as
`expectedVersion`.

On `409` stale version:

1. Do not silently resubmit.
2. Refetch the resource.
3. Show a conflict notice explaining that another user changed the record.
4. Let the user review the new state before trying a new command.

After successful commands, replace or invalidate the detail record and all
related authorized collections, dashboard counts, notifications, and reports
that may have changed.

### 7.4 Idempotency keys

Generate command keys with `crypto.randomUUID()`.

- Generate one key when the user begins a command submission.
- Reuse that exact key only when retrying the exact same serialized input.
- Generate a new key after the user changes any command field.
- Do not store keys in localStorage.
- Disable duplicate submits while a mutation is pending.

### 7.5 Attachments

- Validate obvious client limits for usability, but trust the backend result.
- Upload one file per request with `FormData`.
- Include the current ticket `expectedVersion`.
- Refresh ticket and attachment data after reservation/finalization.
- Download through the authenticated API endpoint, preferably as a blob, and
  use the server-provided safe filename.
- Never expect or expose a private storage path.

## 8. Page composition

### Dashboard

Render only sections supplied by the backend. Do not infer absent role sections
or calculate global totals in the browser. Each section needs loading, empty,
error, and partial-health states.

### Ticket detail

Recommended composition:

```text
Header: reference, status, priority, requester-visible assignment
Summary: service snapshot, description, asset snapshots, location
Actions: only actions suggested by current view and local policy hints
Conversation: public comments; internal content only when returned by API
Service level: server-calculated current/historical cycles
History: serialized events appropriate for the viewer
Attachments: authorized metadata and downloads
Staff tabs: internal comments/worklogs only when returned/authorized
```

Do not retain internal data when switching identities. Query cache clearing on
logout is mandatory.

### Assets

Financial fields, full custody, manager actions, and event history should render
only when present in the safe backend representation. Notification possession
or a ticket link never grants asset access.

### Reports

- Display business durations with explicit units.
- Preserve backend timezone and cohort labels.
- Show sample sizes, unanswered/unresolved counts, exclusions, numerator, and
  denominator near percentages.
- Display `null` percentages as “No data,” never as 0%.
- Keep current workload separate from completed-period metrics.
- Never recompute SLA elapsed time from timestamps in the browser.

### Administrator pages

- Access grants use revoke-and-create lifecycle; there is no ordinary edit.
- Audit metadata is already redacted; do not add client-side entity lookups that
  expand visibility.
- Health components must preserve `healthy`, `degraded`, `unavailable`,
  `unknown`, and `not-configured` distinctions.
- Administrator navigation must not contain operational ticket/asset views
  unless the same user has separate valid operational grants and the backend
  returns those views.

## 9. Design system and accessibility

### Visual foundations

Define CSS custom properties for:

- neutral, brand, success, warning, danger, and information colors;
- text/background/border roles rather than component-specific colors;
- 4 px spacing scale;
- typography sizes and line heights;
- border radii, shadows, focus ring, and layout widths;
- compact and comfortable table density.

Support light mode first. Add dark mode only after the base contrast and data
visualization palette are verified.

### Accessibility requirements

- Target WCAG 2.2 AA.
- Every action must be keyboard reachable with visible focus.
- Use semantic headings, landmarks, tables, labels, buttons, and links.
- Dialogs trap focus, have labelled titles, close on Escape when safe, and
  restore focus to their trigger.
- Status is never communicated by color alone.
- Announce mutation results and validation summaries through an appropriate live
  region.
- Use native form controls where practical.
- Provide text alternatives for charts and summary visuals.
- Respect reduced-motion preferences.

### Responsive behavior

- Desktop: persistent sidebar and multi-column detail layout.
- Tablet: collapsible navigation and reduced dashboard columns.
- Mobile: drawer/bottom navigation, single-column forms, cards or scroll-safe
  tables, and sticky primary actions where helpful.
- Do not hide essential information solely because the viewport is small.

## 10. Error and feedback strategy

Map backend outcomes consistently:

| Status | Frontend behavior |
| --- | --- |
| 400/422 | Field/form error where possible; otherwise validation summary |
| 401 | Clear auth/query state and redirect to sign-in |
| 403 | Forbidden feedback without sensitive details |
| 404 | Generic missing-or-inaccessible state |
| 409 | Conflict notice and resource refetch; no blind retry |
| 413 | File/payload size feedback |
| 429 | Login throttling message without account enumeration |
| 500 | Generic error plus request ID |
| 503 | Service unavailable/degraded guidance |

Use skeletons for initial page structure, small spinners for contained actions,
empty states for valid zero-result responses, and toasts only for short-lived
confirmation. Critical errors and conflicts remain visible in the page/dialog.

## 11. Testing strategy

### Unit tests

- Permission/navigation helpers, including administrator non-bypass.
- URL filter parsing and serialization.
- Error-envelope parsing.
- Date/duration/currency display utilities.
- Idempotency-key lifecycle.

### Component tests

- Login, forced password change, and session list.
- Dashboard sections for all roles and grant combinations.
- Ticket actions and stale-version conflicts.
- Internal/public content boundaries.
- Reports with empty denominators and reconciliation states.
- Health component statuses.
- Accessible dialog and keyboard behavior.

### Integration tests with MSW

- App boot through `/auth/me`.
- 401 session expiry and query-cache clearing.
- CSRF header present on mutations and absent from logs/storage.
- Grant revocation reflected after refetch.
- Mutation invalidation of detail/list/dashboard data.
- Inaccessible resources use the generic 404 UI.

### Browser tests

Keep end-to-end coverage focused on high-value journeys:

1. Login, dashboard, logout.
2. Employee submits and follows a ticket once catalog reads are available.
3. Technician claims, starts, replies, and resolves.
4. Requester closes the ticket.
5. Supervisor approval decision.
6. Administrator creates/revokes a grant and observes the next-request effect.
7. Notification opens only an otherwise authorized resource.

Run browser tests against an isolated backend database/replica set. Do not use
production accounts or data.

## 12. Delivery phases

### Phase 0: foundation

- Install approved router/query/form/test dependencies.
- Add Vite `/api` proxy and `.env.example`.
- Establish styles, providers, HTTP client, error boundary, test setup, and
  route metadata.
- Add continuous checks: lint, unit/integration test, and production build.

### Phase 1: authentication and shell

- Sign-in, boot-time `/auth/me`, logout, forced password change, security page,
  session revocation, protected routes, navigation, responsive layout.
- Verify cookies, CSRF, 401/403/404 handling, and cache clearing.

### Phase 2: dashboard and notifications

- Role-aware dashboard using only returned sections.
- Notification list/menu and idempotent mark-read.
- Administrator health page.

### Phase 3: ticket read workflow

- My tickets, queue, filters/pagination, ticket detail, public discussion,
  events, service-level panel, and protected attachments.
- Staff-only panels render only returned authorized content.

### Phase 4: ticket commands

- Claim, start, triage, assignment, wait/resume, worklog, resolve, close,
  cancel, reopen, and approval actions.
- Implement shared expected-version, idempotency, and conflict UX first.
- Add new-ticket form only after service/location discovery APIs are available.

### Phase 5: assets

- Authorized inventory and detail, custody/history, links, assignment/return,
  and state changes.
- Create/edit forms wait for department/location/user lookup APIs.

### Phase 6: reports and administration

- Overview report with accurate units/cohorts/no-data states.
- Access-grant list/create/revoke.
- Redacted audit explorer.
- Complete operational health presentation.

### Phase 7: hardening and release

- Accessibility audit, responsive QA, performance budget, browser matrix,
  security review, production error handling, and end-to-end smoke tests.
- Update user/operator documentation with verified behavior only.

## 13. Performance and observability

- Lazy-load route bundles and large feature dialogs.
- Keep the initial authenticated shell small; do not preload all administrator
  features for ordinary employees.
- Debounce text searches while keeping submitted URL state explicit.
- Use server pagination; never fetch entire ticket, asset, audit, or notification
  collections for client pagination.
- Avoid speculative prefetch of resources the current user may not access.
- Record only safe frontend diagnostics: route template, error code, request ID,
  release version, and timing. Exclude form bodies, email addresses, IDs where
  unnecessary, comments, descriptions, tokens, cookies, and attachments.
- Establish a bundle-size budget during Phase 0 and inspect Vite build output in
  CI.

## 14. Naming and coding conventions

- Components and pages: `PascalCase.jsx`.
- Hooks: `useSomething.js`.
- Feature API/query modules: `api.js`, `queries.js`, `mutations.js`.
- Pure utilities: descriptive `camelCase.js` names.
- Tests: `Name.test.jsx` beside the owning feature or in its test folder.
- Prefer named exports for feature modules; route-level lazy components may use
  default exports if it simplifies router loading.
- Keep components focused. Extract a component when it has independent state,
  reuse, accessibility behavior, or meaningful test boundaries—not merely to
  reduce line count.
- Never spread a full form object into an API body. Construct exact allowlisted
  request objects so unexpected fields cannot be sent.

## 15. Definition of done

A frontend slice is complete only when:

- It uses the real backend contract and does not depend on hard-coded IDs.
- Loading, empty, validation, conflict, unauthorized, not-found, and unexpected
  error states are handled.
- Current permissions are respected, with the backend remaining authoritative.
- Mutations use CSRF, expected versions, and idempotency where required.
- Sensitive values are absent from browser storage, logs, URLs, query keys, and
  analytics.
- Keyboard and screen-reader behavior is tested for interactive components.
- Relevant unit/component/integration tests pass.
- `npm run lint`, the frontend test command, and `npm run build` pass.
- Documentation describes only behavior verified against the backend.

## 16. Immediate next implementation task

Start with Phase 0 and Phase 1 only:

1. Add the approved dependencies and Vite API proxy.
2. Create the target `app`, `shared`, `layouts`, `pages`, and `features/auth`
   foundations.
3. Implement the HTTP/error client.
4. Implement `/auth/me` bootstrapping, login, logout, forced password change,
   sessions, and session revocation.
5. Build the responsive application shell and policy-driven navigation.
6. Add tests for cookie-based requests, in-memory CSRF, route guards, cache
   clearing, and error envelopes.

Do not begin ticket creation or asset administration forms until their required
lookup endpoints are available or the backend contract is explicitly extended.
