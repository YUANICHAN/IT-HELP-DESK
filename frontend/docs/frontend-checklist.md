# Deskflow frontend implementation checklist

## Current baseline

- [x] React 19 and React DOM 19 retained.
- [x] Vite 8 retained.
- [x] Plain JavaScript/JSX retained; no TypeScript migration proposed.
- [x] Existing frontend remains the minimal Vite starter; Step 1 makes documentation changes only.
- [x] No packages installed and no application/backend code changed in Step 1.
- [x] Deskflow is the approved product name and Deskflow Blue is the approved light-theme direction.

Evidence: `frontend/package.json:1-25`, `frontend/src/main.jsx:1-10`, `frontend/vite.config.js:1-7`.

## Step 1 — Backend contract review

### Repository and evidence review

- [x] Read repository README and confirmed there is no `AGENTS.md` in the repository.
- [x] Read the existing frontend plan and Deskflow implementation roadmap without changing the user-owned untracked files.
- [x] Inspected API mount points and all route modules.
- [x] Traced auth, access, ticket, approval, attachment, SLA, asset, notification, dashboard, report, audit, and health routes through controllers/services.
- [x] Inspected validators/allowlists, policies/scope filters, serializers, data enums, idempotency/version helpers, CORS/CSRF/session middleware, and relevant tests.
- [x] Compared claims against the repository verification record. Prior recorded runtime evidence is labeled separately from this review's static inspection.
- [x] Classified every planned screen/action as available, partial, missing, or unverified in [api-contract.md](api-contract.md).

### Contract coverage

- [x] Sign-in, bootstrap, logout, forced/voluntary password change, session list/revoke.
- [x] HttpOnly cookie, credentialed request, CSRF acquisition/rotation, session expiry, and grant-revocation behavior.
- [x] Role/scope-aware dashboard and exact supported sections.
- [x] Ticket list, technician queue, creation, detail, edit, comments, events, worklogs, attachments, SLA, and approval history.
- [x] Ticket triage, claim, assignment, start, wait, resume, resolve, close/confirmation, cancel, and reopen commands.
- [x] Approval inbox, decision, server-side fallback, manual reroute, and history.
- [x] Asset inventory/own access, selectable assets, detail, creation/edit, custody, events, linked tickets, and lifecycle commands.
- [x] Notification list/current-access suppression and mark-read.
- [x] Overview report units, timezone, cohorts, exclusions, and null semantics.
- [x] Administrator access grants, limited audit explorer, and operational health.
- [x] Account/master-data/settings gaps and lookup dependencies.
- [x] Common envelopes, both pagination formats, CSRF, expected versions, idempotency, errors, and frontend behavior.

### UI direction

- [x] Deskflow Blue palette and starter tokens documented.
- [x] Sidebar/header/surface/spacing/radius/type dimensions documented.
- [x] Dashboard, tickets, detail, forms, approvals, assets, notifications, reports, and administration composition documented.
- [x] Desktop/tablet/mobile navigation and stacking behavior documented.
- [x] Visible labels, focus, contrast, keyboard, zoom/reflow, status text, and reduced-motion requirements documented.
- [x] Widgets constrained to actual backend fields; global search, trend charts, exports, and live conversation dependencies recorded.

## Verified capability status

### Available for frontend implementation

- [x] Authentication bootstrap and sign-in/logout.
- [x] Forced and voluntary password change.
- [x] User-owned active session list/revocation.
- [x] Role/scope-shaped dashboard.
- [x] Authorized ticket list and support queue.
- [x] Ticket detail and descriptive patch (same-origin).
- [x] Public replies, internal notes, worklogs, events, protected attachment metadata/download/upload.
- [x] Claim, start, wait/resume, resolve, requester close/confirmation, cancel, and reopen.
- [x] Approval inbox, decision, and safe history.
- [x] SLA current cycle plus staff-only cycles, pauses, priority changes, and breaches.
- [x] Authorized own/scoped/manager asset inventory and detail.
- [x] Asset return, lifecycle commands, custody/events/linked-ticket history.
- [x] Notifications and mark-read.
- [x] Authorized overview report.
- [x] Administrator health.
- [x] Administrator access-grant list/revoke.
- [x] Authentication/access-administration audit explorer.

### Partial — backend command exists, frontend choice contract is incomplete

- [ ] New ticket: requires active service catalog and department-valid location lookups.
- [ ] Selectable ticket assets: endpoint exists but needs a discoverable service ID first.
- [ ] Triage: allowed service-snapshot categories are not returned by detail or lookup.
- [ ] Assignment/reassignment: no eligible support-technician lookup.
- [ ] Approval reroute: no ticket-specific eligible approver lookup.
- [ ] Asset create/edit: no authorized department/location lookups.
- [ ] Asset assignment: no eligible custodian or location lookup.
- [ ] Access-grant create: no administrator-authorized recipient/department lookup.
- [ ] Audit actor filter: no administrator-authorized actor lookup.
- [ ] Cross-origin ticket/asset patch and all cross-origin idempotent commands: CORS preflight omits `PATCH` and `Idempotency-Key`. Same-origin `/api` works around this deployment issue.
- [ ] General audit: current explorer is limited to authentication and access-grant actions.

### Missing

- [ ] User invitation, activation, forgot/reset password, and account CRUD.
- [ ] Department, location, service catalog, business calendar, and SLA-policy administration.
- [ ] Knowledge base and satisfaction feedback.
- [ ] CSV/export creation and export history.
- [ ] Global cross-resource search.
- [ ] Realtime/push notifications, WebSocket/SSE conversation, typing/presence/read receipts.
- [ ] Trend-series reporting API.

### Unverified

- [ ] Deployed-browser cookie/CORS/reverse-proxy behavior. Requires the actual HTTPS deployment topology.
- [ ] Live antivirus service behavior. Repository tests use a local stub; production ClamAV was not verified (`backend/VERIFICATION.md:223-228`).
- [ ] Real backup/restore execution. Health tests validate manifest evidence only (`backend/VERIFICATION.md:32-35`).
- [ ] Current database-backed runtime. No MongoDB listener was available on ports 27017, 27018, or 27019 during this review.

## Step 2 prerequisites and guardrails

Step 2 (frontend structure and checks) can begin without guessing the shell/auth contracts. It should:

- [x] Keep React/Vite JavaScript/JSX and update the existing lockfile only for the approved dependencies.
- [x] Create central route metadata. Active foundation entries drive the router; planned entries are explicitly unregistered until guards/navigation exist.
- [x] Add a same-origin Vite `/api` proxy aligned with the actual backend origin configuration; do not assume separate-origin CORS is ready.
- [x] Validate public frontend configuration and keep all secrets out of `VITE_*` variables.
- [x] Establish app/page/shared/test boundaries without implementing business screens ahead of their step.
- [x] Establish lint, unit/component/browser test, and production-build scripts before feature work expands.
- [x] Add a contract-aware HTTP layer in its scheduled step: `credentials: "include"`, JSON envelope/error parsing, in-memory CSRF, safe request IDs, cancellation, no unsafe mutation retry.
- [x] Keep permission-sensitive caches memory-only and provide complete private cleanup for logout/identity change wiring.
- [x] Treat `/auth/me` as the bootstrap source and never persist raw cookies/CSRF/permissions.

Step 2 must not:

- [ ] Install or build against invented endpoints.
- [ ] Hard-code service, location, department, user, assignee, approver, custodian, or asset IDs.
- [ ] Treat administrator role as operational capability.
- [ ] Treat assignment as proof of support access.
- [ ] Expose internal notes/worklogs through department supervision.
- [ ] Implement browser-side workflow, SLA, authorization, or report calculations as authority.

## Step 2 — Project foundation

### Completed foundation

- [x] Replaced the empty Vite application root with `app/App.jsx`, root mounting, shared providers, router, and a recoverable root error boundary.
- [x] Added a single shared `QueryClient`; reads never retry `401`, `403`, or `404`, other read failures retry at most once, and mutations never retry generically.
- [x] Added no query persistence. Identity-specific cache clearing remains part of authentication Step 5.
- [x] Registered only `/` as a public foundation placeholder and `*` as a public fallback. No protected route or authorization behavior is claimed.
- [x] Reserved approved future paths in metadata with `registered: false` and `authorization: deferred`.
- [x] Added validated public defaults for `/api/v1` and `Deskflow`, plus `.env.example` containing public values only.
- [x] Proxied Vite `/api` requests to the backend's verified development address, `http://127.0.0.1:5000`, without changing the backend.
- [x] Added baseline reset/global styles using the approved Deskflow Blue colors, visible keyboard focus, responsive foundation layout, and reduced-motion handling. Full component tokens remain Step 3.
- [x] Added Vitest/jsdom, Testing Library, user-event, jest-dom, MSW health fixtures/handler/server, and a reusable provider-aware renderer.
- [x] Added Playwright configuration and a Chromium foundation smoke test.
- [x] Replaced the generic starter README with exact local setup, proxy, public-environment, and verification instructions.

### Dependencies and scripts

Runtime additions: React Router DOM `7.18.5`, TanStack React Query `5.105.0`, React Hook Form `7.91.0`, Zod `4.6.7`, Hook Form resolvers `6.0.2`, Lucide React `1.63.0`, and date-fns `4.4.0`.

Test additions: Vitest `5.0.5`, jsdom `30.1.3`, React Testing Library `16.3.3`, user-event `14.6.8`, jest-dom `7.0.1`, MSW `3.0.3`, and Playwright Test `1.64.1`. React 19 and Vite 8 were retained; no unrelated dependency upgrade was requested or performed.

Scripts now cover development (`dev`), lint (`lint`), non-watch tests (`test`), watch tests (`test:watch`), production build (`build`), preview (`preview`), and browser tests (`test:e2e`).

### Checks performed on 2026-10-29

- [x] `npm run lint`: passed with no ESLint errors.
- [x] `npm test`: 4 files and 11 tests passed. Coverage includes public configuration validation, bounded query retries, mutation retry defaults, public-placeholder wording, unknown-route fallback, and error-boundary recovery without exposing the thrown message.
- [x] `npm run build`: passed; Vite transformed 2,110 modules and emitted the production bundle.
- [x] `npm run test:e2e -- --list`: discovered the Chromium foundation test.
- [x] `npm run test:e2e`: 1 Chromium test passed after installing the machine-local Playwright Chromium runtime.
- [x] Development boot: `GET http://127.0.0.1:5173/` returned `200` and the Deskflow document title.
- [x] Proxy connectivity: `GET http://127.0.0.1:5173/api/v1/health` returned `200` with `status: "ok"`, service `it-help-desk-api`, and database `connected`.
- [x] Direct comparison: `GET http://127.0.0.1:5000/api/v1/health` returned the same healthy service/database state.
- [x] The temporary Vite process used for verification was stopped after the checks.

The first sandboxed Vitest attempt was blocked before collection by Windows `spawn EPERM`; rerunning with permission for Vite's config-loader subprocess succeeded. The first browser execution correctly reported a missing Playwright browser binary; only Chromium was installed, after which the test passed. Neither event was an application/test assertion failure.

### Local configuration and deferred work

- Run the backend on `127.0.0.1:5000` with its transaction-capable MongoDB configuration before starting the frontend.
- Keep `AUTH_ALLOWED_ORIGINS` inclusive of `http://127.0.0.1:5173`; the backend example already contains it.
- Copy `.env.example` to `.env.local` only when an explicit local file is desired. The checked-in validated defaults are the same.
- After a fresh checkout, run `npx playwright install chromium` once before browser tests.
- Step 3 now supplies the complete tokens and reusable controls/cards/tables/dialogs.
- Step 4 now supplies the credentialed HTTP client and server-state API conventions.
- Step 5 owns session bootstrap, auth state, cleanup wiring, and permission guards.
- Step 6 owns the responsive application shell. Feature routes remain unregistered until their owning steps.

Step 2 completion decision: **complete**. No foundation blocker remains. The project is ready for **Step 3 — Blue Design System**.

## Step 3 — Blue design system and reusable components

### Implemented theme and shared UI

- [x] Added Tailwind CSS 4.3.3 and the official `@tailwindcss/vite` 4.3.3 integration.
- [x] Added `src/styles/tailwind.css` with the approved palette and CSS-first `@theme` values for semantic surface/text/border/status roles, system font stack, body/page/section/table typography, radii, restrained shadows, control dimensions, and future shell dimensions.
- [x] Consolidated reset/preflight, tokens, typography, focus, link/selection defaults, and reduced-motion behavior into the Tailwind entry file.
- [x] Converted all component, feedback, page, error-boundary, and development-gallery styling from CSS Modules to Tailwind utility classes. No `.module.css` files remain.
- [x] Added primary, secondary, ghost, and destructive `Button` variants with disabled and duplicate-safe pending states.
- [x] Added accessible `IconButton`, native `Input`, `Select`, `Textarea`, and `Checkbox` controls with visible labels, required text, help/error descriptions, and invalid state.
- [x] Added `Card`, `CardHeader`, `PageHeader`, and text-labelled `Badge` primitives.
- [x] Added semantic parent-controlled `DataTable` and `Pagination`, including selected, loading, empty, compact/comfortable, and bounded-page states. Neither component fetches or applies business permissions.
- [x] Added reduced-motion-aware `Skeleton` and labelled `Spinner` loading primitives.
- [x] Added focus-managed `Dialog` and `ConfirmDialog` with title/description association, Tab trapping, safe Escape/backdrop behavior, pending protection, body-scroll lock, and opener focus restoration.
- [x] Added distinct `EmptyState`, `ErrorState`, `FormError`, persistent `ConflictNotice`, and short polite `ToastProvider` feedback.
- [x] Registered `ToastProvider` at the application provider boundary without adding business or network state.
- [x] Restyled the foundation, not-found page, and root error boundary to consume the shared token/component language.

### Development preview and responsive review

- [x] Added the development-only `/dev/components` gallery and a foundation-page link that appears only in development.
- [x] Kept gallery fixtures in `src/dev/fixtures/componentPreview.js`, separate from production features and explicitly labelled synthetic.
- [x] Included button variants/states, labelled form validation, backend-verified ticket status examples, P1–P4 priorities, service-category examples, asset tags, approval decisions, summary cards, a controlled ticket table, loading/empty/error states, a conflict notice, a confirmation dialog, and a confirmation toast.
- [x] Playwright verified no document-level horizontal overflow at 360, 768, and 1440 px; wide tables remain inside a labelled scroll region.
- [x] Desktop and 360 px full-page renders were inspected. Type hierarchy, white surfaces, pale canvas, blue actions, essential control boundaries, labelled status colors, stacking, and contained table overflow matched the approved direction.
- [x] Recorded the eventual white flush-left sidebar direction in the design system while leaving sidebar/header/navigation behavior to Step 6.
- [x] Confirmed the gallery component is excluded from the production bundle and its route is unregistered when `import.meta.env.DEV` is false.

### Focused behavior coverage

- [x] Form controls: visible labels, required state, help text, validation descriptions, and `aria-invalid` associations.
- [x] Dialogs: accessible title/description, initial focus, Tab wrap, safe non-dismissable Escape state, Escape close, and opener focus restoration.
- [x] Buttons: enabled activation plus disabled/pending duplicate prevention and `aria-busy`.
- [x] Data table: caption, column headers, real record link, and selected-row semantics.
- [x] Pagination: disabled bounds, parent callback, and controlled range update.

### Checks performed on 2026-10-29

- [x] `npm run lint`: passed with no ESLint errors.
- [x] `npm test`: 8 files and 17 tests passed.
- [x] `npm run build`: passed after the Tailwind migration; Vite 8.3.5 transformed 2,116 modules and emitted the production bundle.
- [x] `npm run test:e2e`: 5 Chromium tests passed, covering the foundation, component-preview reflow at three widths, no page overflow, and keyboard dialog close/focus restoration.
- [x] `git diff --check`: passed; only the repository's existing Windows LF-to-CRLF notices were reported.
- [x] The first sandboxed Vitest/build attempts were blocked before collection/build by Windows `spawn EPERM`; both passed when Vite's config-loader subprocess was permitted. This was an environment restriction, not an assertion or compilation failure.
- [x] The temporary visual-review Vite server was stopped after desktop/mobile captures.

Step 3 completion decision: **complete**. No Step 3 blocker remains. The missing reference-image file is documented and did not prevent implementation against the approved written direction. API/data infrastructure remains correctly deferred; the project is ready for **Step 4 — API and Data Layer**.

## Step 4 — API and data layer

### Shared transport and authentication integration

- [x] Added the validated-base-URL HTTP client with credentialed requests,
  JSON-only content headers, browser-owned multipart boundaries, AbortSignal,
  verified envelope parsing, `204`/`205`, request metadata, and authenticated
  blob downloads with safe filenames.
- [x] Added `ApiError` normalization for status, code, safe message, request ID,
  validation details, and retry guidance. Cancellation remains distinct from a
  network/API failure.
- [x] Added in-memory CSRF replace/clear/read functions, protected-session expiry
  subscriptions, and protected-request cancellation. No JWT or browser-storage
  session state was introduced.
- [x] Added private-query cancellation/removal and mutation-cache cleanup for
  Step 5 session changes while retaining explicitly public cache entries.

### Query, URL, and mutation conventions

- [x] Completed hierarchical query-key factories for identity, dashboard,
  ticket detail/timelines/attachments/SLA, assets, approvals, notifications,
  reports, access grants, audit, and health.
- [x] Query keys reject secrets, fingerprint raw search text, and remain
  memory-only. Permission decisions are not given a permanent stale time.
- [x] Reads retry at most once only for eligible network/temporary server
  failures; cancellation and `401`, `403`, `404`, conflicts, throttling, and
  unknown errors do not retry. Mutations have no generic retry.
- [x] Added exact capability filter allowlists, normalization/issue reporting,
  canonical URL state, page reset on filter changes, and explicit pagination
  normalization for `totalPages` versus `pages`.
- [x] Added stable exact-request serialization, in-memory UUID idempotency,
  duplicate-submit prevention, exact uncertain retry reuse, changed-input key
  replacement, stale-version classification, conflict refresh content, and
  targeted invalidation plans.

### Feature boundaries and focused coverage

- [x] Added representative `auth`, `health`, and `tickets` feature API/query
  modules with exact request construction and Zod checks at critical response
  boundaries.
- [x] Added versioned/idempotent ticket claim and attachment upload conventions.
  Upload/download reservation, scan/finalization, refetch, and safe filename
  requirements are documented in [api-contract.md](api-contract.md).
- [x] MSW/fetch-level tests cover credentials, CSRF, JSON, FormData, empty
  responses, blobs, envelopes/errors, session expiry, and cancellation.
- [x] Unit/integration tests cover retry bounds, filter allowlisting, both
  pagination shapes, query-key privacy, version conflicts, idempotency reuse,
  targeted invalidation, private cleanup, and an exact ticket command.

### Checks performed on 2026-10-29

- [x] `npm run lint`: passed with no ESLint errors.
- [x] `npm test`: 15 files and 45 tests passed. Seven shared API/query test
  files contain 31 focused Step 4 tests; ticket feature-boundary coverage is
  included in the full total.
- [x] `npm run build`: passed; Vite 8.3.5 transformed 2,117 modules and emitted
  the production bundle.
- [x] `git diff --check`: passed; Git reported only expected Windows
  LF-to-CRLF working-copy notices.
- [x] The focused and full client checks use synthetic MSW/fetch fixtures and
  are explicitly mocked, not evidence of a live database-backed backend.
- [ ] Live read: `GET http://127.0.0.1:5000/api/v1/health` was attempted with a
  five-second timeout and the backend was not listening. A Vite proxy read was
  therefore not claimed. Repeat the documented `/api/v1/health` proxy check
  when the backend and transaction-capable MongoDB are available.

The first sandboxed Vitest and production-build attempts could not launch
Vite/Tailwind's Windows helper processes (`spawn EPERM`). The same commands
passed when those required local subprocesses were permitted; this was an
execution-environment restriction rather than an assertion or compile failure.

### Remaining dependencies

- [ ] A live proxy read requires the backend and its transaction-capable MongoDB
  to be running; mocked contract checks do not claim live backend integration.
- [ ] Cross-origin deployments still require the backend CORS allowlist to add
  `PATCH` and `Idempotency-Key`; the documented same-origin `/api` topology is
  the supported path today.
- [x] Step 5 connected auth bootstrap/login/logout/session replacement,
  redirects, and private UI cleanup to the integration points added here.
- [ ] Missing authorized service/location/department/user choice endpoints still
  block the production forms listed in the capability register.

Step 4 completion decision: **complete**. The shared client, session integration
points, cache lifecycle, query conventions, and representative feature
boundaries are ready for **Step 5 — Authentication**. Live backend/proxy
verification remains a release-environment check, not a blocker to the mocked
contract implementation.

## Step 5 — Authentication and account security

### Authentication ownership and routes

- [x] Added `AuthProvider` with explicit booting, authenticated, signed-out, and
  recoverable authentication-service failure states.
- [x] Kept `authKeys.me()` as the identity source and synchronized only the
  current CSRF token with the in-memory Step 4 integration.
- [x] Added `/sign-in`, `/change-password`, and `/security` to central route
  metadata and protected private routes without exposing protected content
  during bootstrap.
- [x] Added same-origin return-path validation that rejects external,
  protocol-relative, backslash, API, and authentication-loop destinations.
- [x] Added `RequireAuth` and `RequirePasswordChangeComplete`; role and
  capability authorization remain separate and backend-authoritative.

### Sign-in, rotation, logout, and sessions

- [x] Added the accessible sign-in form with exact request fields, generic
  invalid-credential feedback, duplicate-safe pending behavior, password
  visibility, and `Retry-After` throttling feedback.
- [x] Added forced and voluntary password-change forms using the verified
  12–128 Unicode-character and 1024-byte policy, confirmation validation,
  server field errors, and `ACCOUNT_CHANGED` handling.
- [x] Replaced identity and CSRF after password/session rotation only after
  previous private requests and cache state are cleared.
- [x] Connected protected-session expiry and logout to protected-request
  cancellation, private query/mutation cleanup, CSRF clearing, and transition
  isolation. Failed logout clears local state while explicitly stating that
  server revocation could not be confirmed.
- [x] Added safe active-session presentation and confirmed revocation for other
  and current sessions using only backend-returned metadata.
- [x] Kept password reset, invitations, activation, and account recovery visibly
  unsupported; no endpoint or synthetic workflow was invented.

### Focused verification

- [x] Bootstrap success, unauthenticated response, temporary failure/retry, and
  protected-content suppression.
- [x] Sign-in success, generic invalid credentials, throttling, exact fields,
  accessible labels, and validation associations.
- [x] Safe returns, protected routing, forced password change, CSRF replacement,
  and post-rotation navigation.
- [x] Logout, protected expiry, private-cache cleanup, identity replacement, and
  delayed-response isolation.
- [x] Other-session and current-session revocation with confirmation and
  lifecycle-specific outcomes.

### Checks performed on 2026-10-29

- [x] `npm run lint`: passed with no ESLint errors.
- [x] `npm test -- --run`: 20 files and 72 tests passed, including 29 focused
  auth/route tests.
- [x] `npm run build`: passed; Vite 8.3.5 transformed 2,153 modules and emitted
  the production bundle.
- [x] `npm run test:e2e`: six Chromium tests passed, including authenticated
  bootstrap, signed-out redirect, responsive gallery, and dialog keyboard use.
- [x] `git diff --check`: passed; Git reported only expected Windows
  LF-to-CRLF working-copy notices.
- [x] Unit and route integration checks use synthetic MSW fixtures. They verify
  the browser contract but do not claim a live database-backed authentication
  session.
- [ ] Live authentication verification requires an authorized test account and
  a running backend with transaction-capable MongoDB; neither is currently
  available in the checked-in frontend environment.
- [ ] Live availability: `GET http://127.0.0.1:5000/api/v1/health` was attempted
  and the backend was not listening. No live login/session claim is made.

### Remaining dependencies

- [ ] Repeat login, cookie rotation, CSRF, logout, and session-revocation smoke
  tests against the deployed same-origin backend with authorized test accounts.
- [ ] Password reset, activation, invitations, and other account-lifecycle flows
  remain blocked on missing backend contracts.
- [ ] Step 6 must replace the authenticated foundation page with the responsive
  application shell and permission-aware navigation.

Step 5 completion decision: **complete**. The authentication lifecycle and
account-security screens are ready for **Step 6 — Responsive Application Shell
and Navigation**. Live same-origin account testing remains a deployment check,
not a substitute for the passing mocked contract coverage.

## Sequenced readiness for later steps

| Roadmap area | Readiness | Prerequisite before production completion |
| --- | --- | --- |
| Step 2 structure/checks | Ready | None beyond package compatibility checks |
| Step 3 design system | Complete | None; reuse the implemented tokens and shared components |
| Step 4 HTTP/server state | Complete | Use the implemented same-origin client and explicit pagination variants |
| Step 5 auth/security | Complete | Deployment cookie/origin smoke test remains for release |
| Step 6 shell/navigation | Ready | Navigation must be conservative and permission-aware |
| Step 7 dashboard/notifications | Ready | No realtime claims; render only returned sections |
| Step 8 ticket read | Ready | None |
| Step 9 new ticket | Blocked for production | Service and location discovery APIs; selectable assets then becomes usable |
| Step 10 ticket operations | Partially ready | Category, assignee lookup gaps; remaining commands ready |
| Step 11 approvals | Partially ready | Eligible approver lookup for reroute; inbox/decision/history ready |
| Step 12 assets | Partially ready | Department/location/custodian lookups for create/edit/assign; read/return/lifecycle ready |
| Step 13 reports | Ready for summaries | Trend/export APIs required for those extras |
| Step 14 administration | Partially ready | Recipient/department lookup for grant create; master-data APIs missing |
| Step 15 hardening | Pending implementation | Real browsers, identities, mobile/zoom/keyboard, conflicts, deployment failures |
| Step 16 release | Pending implementation | HTTPS same-origin/proxy, cookie/CORS, deep links, upload limits, rollback |

## Required implementation test scenarios

### Authentication and data isolation

- [x] Boot skeleton prevents protected-content flash.
- [x] Login obtains HttpOnly cookie implicitly and keeps CSRF only in memory.
- [x] Forced-change account reaches only change-password/logout.
- [x] Password change replaces session/CSRF and clears all prior user caches.
- [x] Current-session revoke signs out; other-session revoke updates list.
- [x] Expiry, account disable, session-version change, and logout clear private state.
- [x] Switching test identities cannot reveal prior internal comments, worklogs, assets, reports, or notifications.

### Authorization

- [ ] Administrator without grants has no support/asset navigation or data.
- [ ] Assigned technician whose support grant is revoked loses access on next request.
- [ ] Department supervisor sees public ticket history but not internal notes/worklogs.
- [ ] Notification/attachment direct URLs reauthorize and fail without current access.
- [ ] 403/404 UI does not disclose hidden resource existence.

### Concurrency and mutations

- [ ] Exact transport retry reuses the same body and idempotency key.
- [ ] Edited submission uses a new idempotency key.
- [ ] Stale ticket/asset/approval version refetches and requires review; no silent retry.
- [ ] Attachment success/error refetches the ticket version and attachment list.
- [ ] Duplicate submit is disabled while pending.

### Data presentation

- [ ] `totalPages` and `pages` response variants both paginate correctly.
- [ ] Report null percentage says “No data”; zero remains zero.
- [ ] Business seconds, seconds, calendar-day aging, timezone, and report boundaries are labeled.
- [ ] Health unknown/not-configured never appears healthy.
- [ ] Status is always available as text, not color alone.

### Responsive and accessible behavior

- [ ] Complete keyboard journey through sign-in, navigation, filters, tables/cards, dialogs, and commands.
- [ ] Drawer/dialog focus trap and restoration.
- [ ] 200% zoom/reflow and mobile ticket detail stacking.
- [ ] Visible focus not clipped; essential control borders remain visible.
- [ ] Loading/errors/conflicts announced appropriately; reduced motion honored.

## Step 1 validation record

Checks performed in this review:

- [x] Route inventory compared against all `app.use` registrations.
- [x] Static source tracing with repository line references.
- [x] Relevant test entry points and repository verification record inspected.
- [x] Confirmed no MongoDB listener on local ports 27017, 27018, or 27019; current integration suite therefore not run.
- [x] Frontend lint: `npm run lint` passed.
- [ ] Frontend production build: Vite ran but correctly failed on the pre-existing empty `src/App.jsx` because `src/main.jsx` imports a default `App`. Step 2 must establish the application root; Step 1 did not change application code.
- [x] Backend syntax: `node --check` passed for all 144 JavaScript files under `src`, `scripts`, and `test`.
- [x] Database-independent SLA unit tests: 4 passed, 0 failed (`node --test test/sla.business-time.test.js`).
- [x] All three Markdown files validated with no trailing whitespace, broken local Markdown links, missing evidence paths, or out-of-range first line references.
- [x] `git diff --check` passed for tracked changes; the new Step 1 documents are untracked until the user stages them.

Step 1 completion decision: **complete**. Step 2 is contract-ready for the non-blocked slices listed above. Its first baseline task is to create a real exported application root so the production build can pass.

