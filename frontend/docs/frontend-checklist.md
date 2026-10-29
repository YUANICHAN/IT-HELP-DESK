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
- [ ] Add a contract-aware HTTP layer in its scheduled step: `credentials: "include"`, JSON envelope/error parsing, in-memory CSRF, safe request IDs, cancellation, no unsafe mutation retry.
- [ ] Keep permission-sensitive caches memory-only and clear all of them on logout/identity change.
- [ ] Treat `/auth/me` as the bootstrap source and never persist raw cookies/CSRF/permissions.

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
- Step 3 owns the complete tokens and reusable controls/cards/tables/dialogs.
- Step 4 owns the credentialed HTTP client and server-state API modules.
- Step 5 owns session bootstrap, auth state, cache clearing, and permission guards.
- Step 6 owns the responsive application shell. Feature routes remain unregistered until their owning steps.

Step 2 completion decision: **complete**. No foundation blocker remains. The project is ready for **Step 3 — Blue Design System**.

## Sequenced readiness for later steps

| Roadmap area | Readiness | Prerequisite before production completion |
| --- | --- | --- |
| Step 2 structure/checks | Ready | None beyond package compatibility checks |
| Step 3 design system | Ready | Rendered contrast/focus/keyboard verification during implementation |
| Step 4 HTTP/server state | Ready | Use same-origin topology; model both pagination shapes |
| Step 5 auth/security | Ready | Deployment cookie/origin smoke test remains for release |
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

- [ ] Boot skeleton prevents protected-content flash.
- [ ] Login obtains HttpOnly cookie implicitly and keeps CSRF only in memory.
- [ ] Forced-change account reaches only change-password/logout.
- [ ] Password change replaces session/CSRF and clears all prior user caches.
- [ ] Current-session revoke signs out; other-session revoke updates list.
- [ ] Expiry, account disable, session-version change, and logout clear private state.
- [ ] Switching test identities cannot reveal prior internal comments, worklogs, assets, reports, or notifications.

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

