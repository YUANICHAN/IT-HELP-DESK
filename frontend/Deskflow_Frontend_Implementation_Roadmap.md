# Deskflow — Frontend Implementation Roadmap

Prepared: 29 October 2026 · Theme: Deskflow Blue · Status: implementation plan

This roadmap expands the supplied frontend plan into numbered, reviewable implementation steps. It is a new companion document; the supplied plan remains the architecture baseline. The backend is reported complete. Its current code, documentation, and responses must settle the API gaps still listed in the supplied plan before dependent frontend screens are enabled.

## 1. Product and implementation direction

Build a minimal, responsive IT Help Desk and Asset Management application for employees, technicians, supervisors, and administrators. Preserve the supplied React/JavaScript architecture and use the reference image's white sidebar, light canvas, restrained cards, clear spacing, and blue accents.

Use React with JSX and the existing Vite project. Keep business rules, access decisions, workflow transitions, SLA calculations, reports, and audit records authoritative on the backend.

The first fully connected journey is:

1. Sign in and load the current identity.
2. View the authorized dashboard and personal tickets.
3. Submit a request using real service/location choices once those reads are verified.
4. A permitted technician claims or receives it, starts work, replies, and resolves it.
5. The requester confirms completion using the backend's close/confirmation command.

Finish this journey before expanding all secondary screens. Approval-gated services follow the backend approval path before work starts.

## 2. Implementation steps

Complete each step against its acceptance criteria. Add meaningful contract, permission, and workflow tests alongside the owning step; Step 15 consolidates the cross-feature review.

### Step 1 — Confirm the current backend contract

**Features and work**

- Read the current backend route registration, validators, serializers, authorization policies, API documentation, and relevant existing tests.
- Produce `docs/api-contract.md` and `docs/frontend-checklist.md`.
- Map every planned screen/action to its real method, path, request body, response shape, permission/scope, pagination, expected version, idempotency requirements, and error codes.
- Verify session/CSRF bootstrap, password/session operations, dashboard sections, notifications, ticket operations, approval discovery/decisions, assets, reports, grants, audit, and health.
- Reconcile service/department/location reads, user lookup, account lifecycle, and master-data administration gaps from the supplied plan.
- Record a dependency as available, blocked, or outside this release. Any backend extension is a separately identified task.

**Complete when**

- Every committed page has an API contract or an explicit dependency.
- Response examples come from documentation/tests or authorized test data.
- The exact source for CSRF, versions, permission hints, notification counts, and pagination is documented.
- No planned production form depends on hard-coded database IDs or guessed endpoints.

### Step 2 — Establish the frontend structure and checks

**Features and work**

- Keep the current React/Vite versions unless compatibility requires a documented change.
- Create the folder foundations below; introduce feature files when the feature is built.
- Add React Router, TanStack Query, React Hook Form, Zod/resolvers, Lucide, and date formatting utilities as needed.
- Add Vitest, React Testing Library, MSW, and focused Playwright coverage.
- Add application providers, route metadata, an error boundary, and test helpers.
- Configure the Vite `/api` proxy using the verified backend origin/port. Production should serve the frontend and API under the same origin.
- Add `.env.example`, public configuration validation, and scripts for lint, tests, browser tests, and build.

**Complete when**

- The empty application boots and a protected-route placeholder works.
- One real read request reaches the backend through the configured API path.
- Lint, a meaningful baseline test, and the production build pass.
- Browser configuration contains public values only.

### Step 3 — Build the minimal blue design system

**Features and work**

- Implement the theme tokens, typography, spacing, radii, borders, and focus treatment in this document.
- Build Button, Input, Select, Textarea, Checkbox, Badge, Card, PageHeader, Dialog, ConfirmDialog, Pagination, and table foundations.
- Add skeletons, empty/error states, field validation messages, persistent conflict notices, and short confirmation toasts.
- Include disabled, pending, error, focus, selected, and hover states where relevant.
- Use semantic native controls where practical. Style components with Tailwind utilities backed by the CSS-first semantic theme.

**Complete when**

- Representative controls, a ticket row, a summary card, a form, and a dialog share the same tokens.
- Forms have persistent visible labels and keyboard focus is visible.
- A dialog supports keyboard focus management, an accessible title, safe Escape behavior, and focus restoration.
- Text/status combinations have verified contrast; essential controls remain identifiable without color alone.

### Step 4 — Implement the HTTP and server-state infrastructure

**Features and work**

- Create one `fetch` wrapper and an `ApiError` class using the verified envelopes.
- Send cookies with `credentials: "include"`; add CSRF to authenticated mutations.
- Use JSON headers for JSON bodies and browser-generated boundaries for FormData.
- Add hierarchical query keys, cancellation support, allowlisted URL filters, and consistent pagination parsing.
- Configure no automatic retry for 401/403/404, at most one bounded retry for temporary read failures, and no generic mutation retries.
- Centralize expected-version conflict handling and idempotency-key lifecycle for applicable commands.
- Support successful bodyless responses if the actual contract uses them.

**Complete when**

- Representative real success, validation, forbidden, expired-session, not-found, conflict, throttling, and server-failure responses produce the intended UI outcome.
- A 409 refreshes the resource and requires review before a new command.
- An ambiguous command retry reuses the same idempotency key only with the exact same serialized request; changed input receives a new key.
- Query keys, storage, URLs, and logs contain no secrets or sensitive form bodies.

### Step 5 — Complete authentication and account security

**Features and work**

- Build `/sign-in` and the boot-time `/auth/me` flow specified in the supplied plan.
- Keep the identity query as the source of identity data; AuthProvider exposes derived identity/boot state and in-memory CSRF without copying the same server records into another store.
- Implement sign-in, safe internal return navigation, logout, forced password change, the security page, session listing, and revocation where supported by the verified contract.
- Replace in-memory CSRF after session rotation.
- Add protected-route and forced-password-change guards.
- Keep failed login feedback on the form; avoid account enumeration.
- On protected-session expiry or identity switch, cancel in-flight private queries, clear private caches and identity state, and prevent late responses from repopulating a different user's view.

**Complete when**

- Reload restores a valid session without flashing protected data or an incorrect sign-in screen.
- Invalid sign-in, expired session, forced password change, rotation, and logout work against the real backend.
- Logout/identity switching leaves no prior user's ticket, asset, or internal-note data visible.
- React never reads or stores the opaque session cookie value.

### Step 6 — Build the responsive application shell and navigation

**Features and work**

- Create the flush white sidebar, compact header, breadcrumbs, page heading, notification entry, profile/security menu, and main content area.
- Generate navigation and route guards from one route metadata/policy definition.
- Display dashboard, tickets, queue, approvals, assets, reports, and administration links only when supported for the current identity and scope.
- Revalidate identity on focus and relevant security/grant changes.
- Add tablet navigation collapse and a mobile drawer/bottom navigation with safe-area spacing.
- Provide an accessible skip link, active-route indication, and page titles.

**Complete when**

- Employee, technician, supervisor, and administrator test identities see the appropriate navigation; multi-grant users receive their combined authorized views.
- Direct URL visits receive the same policy treatment as navigation clicks.
- Administrator status alone never exposes support, internal-note, or asset-manager screens.
- The shell works at 360, 768, 1024, and 1440 px without whole-page horizontal overflow.

### Step 7 — Connect the dashboard and in-app notifications

**Features and work**

- Show only backend-returned dashboard sections and totals.
- Use up to four relevant summary cards, a recent/priority ticket section, and at most two useful secondary panels.
- Implement notification menu/list, read/unread presentation, mark-read, and safe navigation to otherwise authorized resources.
- Use focus refetch/manual refresh initially. Optional bounded polling can be enabled when justified; push/live presence requires a backend contract.
- Render unread totals only from a supported total/count response; do not count a single paginated page as a global total.

**Complete when**

- Cards match the backend response for each tested scope.
- Loading, no-data, partial-service failure, and retry states are clear.
- Mark-read persists and invalidates the related list/count queries.
- An old notification cannot reveal a now-inaccessible ticket or asset.

### Step 8 — Implement ticket browsing and read-only detail

**Features and work**

- Build personal tickets, authorized support queue, URL-owned search/filters/sort/page, and server pagination.
- Build ticket detail: reference, title, description, service/location/asset snapshots, status/priority, authorized assignment, public conversation, and appropriate event history.
- Display backend-calculated SLA clocks, deadline/state labels, pauses, breach flags, and cycle/history information when returned.
- Add authorized attachment metadata/downloads through the API.
- Render internal notes/worklogs only if the backend explicitly supplies that authorized representation.

**Complete when**

- Refresh and back/forward preserve filters and selected pages.
- Employee and department-supervision views contain no internal notes/worklogs.
- Missing and inaccessible resources use the same generic not-found presentation.
- SLA values match the response; the browser never recomputes business time from timestamps.

### Step 9 — Implement the new-ticket flow

**Dependency:** verified discoverable service, location, department, and relevant asset reads from Step 1.

**Features and work**

- Build a focused request form with a visible title, description, service, and contract-required location/department/asset selections.
- Load allowed choices from real APIs; derive fixed organization/requester fields from the session/backend rather than editable user input.
- Show contextual required fields, limits, accessible validation, and an unsaved-change warning where useful.
- Use the backend's actual priority rules; expose a priority field only when the requester is allowed to set it.
- Create the ticket, then perform attachment steps in the verified reservation/finalization/upload order.
- Keep partial upload failure recoverable without recreating the successfully created ticket.

**Complete when**

- An employee submits a valid real request and lands on its detail page.
- No selection is a pasted ObjectId or hard-coded option standing in for a real lookup.
- Double-clicks and network uncertainty do not accidentally create duplicate tickets under the backend's idempotency contract.
- Validation preserves safe input, failed uploads remain retryable, and list/dashboard data refreshes.

If a required lookup is still missing, leave this step visibly blocked and continue independent ticket/asset read work.

### Step 10 — Complete ticket operations and support conversation

**Features and work**

- Add the exact supported commands for triage, claim, assign/reassign, start, wait, resume, resolve, requester confirmation/close, cancel, and reopen.
- Implement assignment, waiting, resolution, and reopen dialogs with required reasons and real user lookup.
- Add public replies, clearly distinguished staff-only notes, worklogs, and protected attachment uploads.
- Present public conversation in a clean support-thread layout, with author/timestamp and a clear public/internal composer label.
- Use current resource versions and required idempotency keys; disable duplicate submission.
- Invalidate affected detail, lists, dashboard, SLA, notification, and report queries after successful commands.

**Complete when**

- The employee → technician → requester completion journey works on the real backend.
- Unsupported transitions are rejected cleanly; frontend action hints never override a server decision.
- A stale browser tab produces a visible conflict and current detail rather than silently repeating a command.
- Public replies and staff-only content remain correctly separated for all tested identities.
- The conversation does not advertise live delivery, typing, presence, or read receipts without server support.

### Step 11 — Implement approval workflows

**Features and work**

- Build the named approver's inbox using verified approval discovery APIs.
- Show approval requirement, pending/decided state, designated approver, and safe decision history in ticket detail.
- Add approve/reject with required reason and applicable version/idempotency handling.
- Show fallback/rerouting controls only for identities and endpoints that support them.
- Reflect approval blockers in technician actions using server decisions.

**Complete when**

- A named approver can find and decide their eligible request.
- Self-approval fails and an unauthorized user cannot decide via direct URL/actions.
- Work cannot start before required approval, including attempts from a stale tab.
- Decision and fallback history agree with the backend audit/event representation.

### Step 12 — Implement asset views and lifecycle operations

**Features and work**

- Build authorized asset lists/detail, permitted custody view/history, lifecycle state, related tickets, and returned events.
- Provide an employee's own-assets view only through a verified backend scope/filter; do not derive it from an unrestricted client-side inventory.
- Add assignment, transfer, return, repair/state transition, retirement, or other lifecycle commands actually present in the contract.
- Add create/edit forms only if write APIs and real department/location/custodian lookup APIs exist.
- Respect safe representations for financial fields and manager-only data.

**Complete when**

- Employees and asset managers see the appropriate different representations.
- Tested custody/state operations update the detail and authorized lists/history.
- Concurrent asset updates show the same review-before-retry conflict UX as tickets.
- An asset link or notification never grants otherwise missing asset access.

### Step 13 — Implement reports

**Features and work**

- Build the authorized overview report, backend-supported date/scope filters, backlog, response/resolution summaries, and SLA measures.
- Present returned cohorts, timezone, units, samples, exclusions, and denominators clearly.
- Use summary tables first; add charts only when the API supplies the actual comparable series.
- Add text/table equivalents for chart information.
- Add export only when its endpoint and authorization are verified.

**Complete when**

- Metrics reconcile with the permitted backend report data.
- A null percentage displays “No data”; zero and unknown remain different.
- Current workload is visually distinct from completed-period statistics.
- No client-made time aggregation, fake trend series, or export button implies unavailable functionality.

### Step 14 — Implement administration and operational health

**Features and work**

- Build access-grant list/create/revoke with explicit capability and organization/department scope, using real recipient lookup.
- Preserve revoke-and-create lifecycle; do not invent an ordinary grant-edit command.
- Build the scoped, redacted audit explorer with server pagination and safe metadata.
- Display returned worker, storage, backup, and other health components.
- Preserve healthy, degraded, unavailable, unknown, and not-configured states, plus observation timestamps where returned.
- Build users/accounts, departments, locations, services, calendars, and SLA-policy settings only when their corresponding APIs have been verified.

**Complete when**

- The administrator can create/revoke a valid grant and the affected account observes the backend's next-request enforcement after revalidation.
- Administrator status alone still grants no operational ticket/asset access.
- Audit rendering adds no visibility-expanding entity lookups.
- Health does not display a green status for missing/unavailable evidence.
- Any unavailable settings section is omitted or clearly disabled; no editable screen is backed only by mock data.

### Step 15 — Verify workflows, accessibility, resilience, and performance

**Features and work**

- Run the small browser suite covering authentication, ticket completion, approvals, asset custody, grant revocation, and notification authorization.
- Verify multi-tab conflicts, session expiry, access changes, partial API failure, upload failure, and empty reports.
- Review keyboard access, focus restoration, zoom/reflow, status labels, screen-reader announcements, and reduced motion.
- Exercise Chrome/Edge/Firefox and a mobile viewport with authorized test accounts.
- Lazy-load routes, inspect production bundles, keep server pagination, and confirm safe frontend diagnostics.
- Keep test coverage focused on meaningful contracts and user-visible behavior.

**Complete when**

- Relevant tests, lint, and build pass.
- Critical paths work at the target widths and keyboard/zoom checks pass.
- Permission-sensitive data does not persist across users or remain in a view after access loss is learned.
- There are no blocking accessibility, workflow, or production-console defects.

### Step 16 — Release and document verified behavior

**Features and work**

- Serve the built application and API under the intended HTTPS origin; configure SPA deep-link fallback without swallowing API 404s.
- Verify cookie flags, CSRF/origin behavior, and authentication after a fresh browser load.
- Verify authenticated upload/download paths and their reverse-proxy size limits.
- Confirm security headers and static-asset caching are compatible with the app.
- Update user/operator documentation, deployment configuration, and the implementation checklist.
- Keep a known previous frontend build/configuration for rollback and record the release version.

**Complete when**

- Refreshing a deep link works; API failures still return API responses.
- The real deployment passes the core smoke journeys using permitted test data.
- Documentation lists the shipped pages and any explicitly deferred dependencies accurately.
- The release can be rolled back using the documented procedure.

## 3. Folder structure

Keep the existing backend in its current location. The tree below describes only the frontend and does not require moving or renaming backend files. Create feature files as implementation reaches them; avoid empty placeholder modules.

```text
frontend/
  .env.example
  package.json
  vite.config.js
  eslint.config.js
  playwright.config.js
  index.html
  docs/
    api-contract.md
    frontend-checklist.md
    design-system.md
  public/
    favicon.svg
    fonts/                     # only if a local font is adopted
  e2e/
    auth.spec.js
    ticket-lifecycle.spec.js
    approvals.spec.js
    asset-custody.spec.js
    access-revocation.spec.js
  src/
    main.jsx
    app/
      App.jsx
      AppProviders.jsx
      router.jsx
      routeMeta.js             # paths, titles, navigation, guard intent
      queryClient.js
      ErrorBoundary.jsx
    layouts/
      AuthLayout.jsx
      AppLayout.jsx
      AppHeader.jsx
      AppSidebar.jsx
      MobileNavigation.jsx
    pages/
      SignInPage.jsx
      ChangePasswordPage.jsx
      DashboardPage.jsx
      MyTicketsPage.jsx
      QueuePage.jsx
      NewTicketPage.jsx
      TicketDetailPage.jsx
      ApprovalsPage.jsx
      AssetsPage.jsx
      AssetDetailPage.jsx
      NotificationsPage.jsx
      SecurityPage.jsx
      ReportsPage.jsx
      AccessGrantsPage.jsx
      AuditPage.jsx
      SystemHealthPage.jsx
      ForbiddenPage.jsx
      NotFoundPage.jsx
      ServiceUnavailablePage.jsx
    features/
      auth/
        api.js
        queries.js
        schemas.js
        AuthProvider.jsx
        useAuth.js
        RequireAuth.jsx
        RequirePasswordChangeComplete.jsx
        SignInForm.jsx
        ChangePasswordForm.jsx
        SessionList.jsx
      dashboard/
        api.js
        queries.js
        DashboardSections.jsx
        SummaryCard.jsx
      tickets/
        api.js
        queries.js
        mutations.js
        schemas.js
        ticketPolicy.js        # UI hints; backend remains authoritative
        TicketTable.jsx
        TicketFilters.jsx
        TicketForm.jsx
        TicketSummary.jsx
        TicketConversation.jsx
        TicketTimeline.jsx
        TicketActions.jsx
        ServiceLevelPanel.jsx
        AttachmentList.jsx
        dialogs/
          AssignmentDialog.jsx
          WaitingDialog.jsx
          ResolutionDialog.jsx
          ReopenDialog.jsx
      approvals/
        api.js
        queries.js
        mutations.js
        ApprovalTable.jsx
        ApprovalDecisionDialog.jsx
      assets/
        api.js
        queries.js
        mutations.js
        schemas.js
        AssetTable.jsx
        AssetFilters.jsx
        AssetSummary.jsx
        CustodyHistory.jsx
        dialogs/
          AssignAssetDialog.jsx
          ReturnAssetDialog.jsx
          AssetStateDialog.jsx
      notifications/
        api.js
        queries.js
        mutations.js
        NotificationList.jsx
        NotificationMenu.jsx
      reports/
        api.js
        queries.js
        ReportFilters.jsx
        BacklogSummary.jsx
        ServiceLevelSummary.jsx
      administration/
        api.js
        queries.js
        mutations.js
        accessGrants/
        audit/
        health/
    shared/
      config/
        env.js
      api/
        httpClient.js
        apiError.js
        queryKeys.js
        idempotency.js
      auth/
        permissions.js
        navigationPolicy.js
      components/
        Button.jsx
        Input.jsx
        Select.jsx
        Textarea.jsx
        Checkbox.jsx
        Badge.jsx
        Card.jsx
        PageHeader.jsx
        Dialog.jsx
        ConfirmDialog.jsx
        DataTable.jsx
        Pagination.jsx
        DateRangeFields.jsx
        Spinner.jsx
        Skeleton.jsx
      feedback/
        EmptyState.jsx
        ErrorState.jsx
        FormError.jsx
        ConflictNotice.jsx
        ToastProvider.jsx
      hooks/
        useDebouncedValue.js
        useDocumentTitle.js
        useMediaQuery.js
      utils/
        date.js
        duration.js
        currency.js
        pagination.js
        strings.js
      validation/
        commonSchemas.js
    styles/
      tailwind.css              # Tailwind import, semantic @theme, shared base behavior
    test/
      setup.js
      server.js
      handlers/
      fixtures/
      renderWithProviders.jsx
```

- `app` assembles providers/routing and global policy.
- `pages` compose feature components; they do not contain raw network code.
- `features` own business UI, API calls, queries, mutations, and validation.
- `shared` contains reusable infrastructure/primitives and imports no feature/page code.
- Cross-feature orchestration belongs in page/app composition; avoid importing another feature's private implementation.
- Component and page styling uses Tailwind utilities. Keep custom CSS limited to the semantic `@theme`, shared base behavior, and cases utilities cannot express clearly.
- Keep focused unit/component tests beside the owning behavior. Shared test setup and contract mocks live in `src/test`; browser journeys live in `e2e`.
- Use PascalCase for JSX components and camelCase for utilities/hooks/modules. Keep plain JS/JSX.

## 4. Technology and state ownership

| Concern | Choice | Responsibility |
| --- | --- | --- |
| Application | Existing React + Vite | SPA rendering and production assets |
| Routing | React Router | Routes, search parameters, deep links |
| Server state | TanStack Query | Identity query, tickets, assets, reports, cache invalidation |
| Authentication facade | AuthProvider | Derived identity/boot state and in-memory CSRF |
| Forms | React Hook Form + Zod/resolvers | Client usability validation; backend validates again |
| Styling | Tailwind CSS + CSS-first theme variables | Minimal semantic theme with a small owned component set |
| Icons | Lucide | Consistent restrained line icons with accessible labels |
| HTTP | Native fetch wrapper | Cookies, CSRF, envelopes, errors, cancellation |
| Dates | date-fns where helpful | Display only; no frontend SLA/business-calendar engine |
| Tests | Vitest, Testing Library, MSW, Playwright | Contract/component checks and critical browser journeys |

Filters belong in URL search parameters; open drawers/tabs belong in local state. Avoid a second global data store and persistent query caches. Keep the existing package lockfile and verify compatibility when installing dependencies.

Public configuration example:

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_APP_NAME=Deskflow
```

The API proxy target is a development configuration value, selected from the actual backend setup. Public `VITE_*` values must never contain secrets.

## 5. Visual specification — Deskflow Blue

### Reference interpretation

Use the supplied image's clean layout language, adapted to service operations:

- A white, full-height sidebar with a slim right divider and pale-blue active item.
- A pale neutral content canvas with white cards and generous, consistent whitespace.
- A simple header containing the page context, notifications, and profile menu.
- Compact summary cards and readable ticket/asset tables.
- Thin line icons, restrained shadows, and medium rounded corners.
- A full-viewport application shell with the sidebar flush to the left edge.

Use ticket workload, pending actions, approvals, and SLA summaries in place of the reference's sales/profit widgets. Decorative browser chrome, wallpaper, floating outer framing, and large illustration panels are not part of the application layout. A global search field is added only if a matching backend search contract exists; ticket search otherwise stays in the ticket list.

### Theme palette

| Token | Hex | Intended use |
| --- | --- | --- |
| Primary | `#2563EB` | Primary actions, links, focus |
| Primary hover | `#1D4ED8` | Hover/pressed actions; active-item text |
| Primary soft | `#EFF6FF` | Active navigation and subtle information backgrounds |
| Canvas | `#F8FAFC` | Page background |
| Surface | `#FFFFFF` | Sidebar, header, cards, inputs |
| Text | `#0F172A` | Titles and main body text |
| Secondary text | `#475569` | Labels and supporting text |
| Muted text | `#64748B` | Timestamps and secondary metadata |
| Decorative border | `#E2E8F0` | Card/table dividers |
| Essential control border | `#64748B` | Input/select outlines when needed to identify the control |
| Success text / background | `#15803D` / `#DCFCE7` | Resolved/completed states when defined by the backend |
| Warning text / background | `#92400E` / `#FEF3C7` | Waiting, attention, SLA risk |
| Danger text / background | `#B91C1C` / `#FEE2E2` | Errors, breached SLA, destructive actions |

Blue is the brand color; green, amber, and red retain their operational meaning. Always include a text label or icon with status colors. Map the actual backend enum values to labels during Step 1 rather than inventing new states.

Calculated solid-color contrast pairs: white on primary blue ≈ 5.17:1; active blue text on primary-soft ≈ 6.16:1; secondary text on canvas ≈ 7.24:1; green, amber, and red badge text on their paired backgrounds ≈ 4.57:1, 6.37:1, and 5.30:1. These checks do not replace a rendered accessibility review. Pale decorative borders must not be the sole means of identifying an essential input or control.

### Typography and dimensions

| Element | Starting specification |
| --- | --- |
| Font | System UI: `system-ui, -apple-system, "Segoe UI", sans-serif`; optional locally hosted Inter later |
| Page title | 24–28 px, weight 600 |
| Card/section heading | 16–18 px, weight 600 |
| General body/form text | 16 px, line height around 1.5 |
| Table text | 14 px minimum, comfortable row spacing |
| Metadata | 12–13 px, never the sole presentation of critical information |
| Spacing | 4, 8, 12, 16, 24, 32, 48 px |
| Desktop sidebar | 240 px; collapsible compact mode may use 72 px with accessible labels/tooltips |
| Header | About 64 px; can expand for wrapping/zoom |
| Main padding | 24–32 px desktop, 16 px mobile |
| Card radius | 12 px |
| Input/button radius | 8 px |
| Dialog radius | 16 px |
| Touch controls | Prefer at least 44 × 44 px |
| Card shadow | `0 1px 3px rgb(15 23 42 / 0.04)` |
| Focus | 2 px blue outline with 2 px offset; avoid clipping/obscuring it |

Light mode is the initial release. Add dark mode as a separate verified theme after the operational screens are stable.

### Starter tokens

```css
:root {
  color-scheme: light;
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-soft: #eff6ff;
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-text: #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted: #64748b;
  --color-border: #e2e8f0;
  --color-control-border: #64748b;
  --color-success: #15803d;
  --color-success-soft: #dcfce7;
  --color-warning: #92400e;
  --color-warning-soft: #fef3c7;
  --color-danger: #b91c1c;
  --color-danger-soft: #fee2e2;
  --font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-dialog: 16px;
  --shadow-card: 0 1px 3px rgb(15 23 42 / 0.04);
  --sidebar-width: 240px;
  --header-min-height: 64px;
}

:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
```

Components should also suppress their nonessential animations when reduced motion is requested. Keep placeholder text readable and use visible labels independently of placeholder text.

## 6. Screen composition

| Screen | Minimal layout and primary action |
| --- | --- |
| Sign-in | Quiet branded header, one clear form, visible labels, inline errors; one Sign in action |
| Dashboard | Page title and New ticket when permitted; 3–4 relevant totals; recent tickets; relevant pending approvals/SLA attention panel |
| My Tickets / Queue | Title, relevant primary action, compact filter row, readable server-paginated table; cards or contained horizontal table scroll on mobile |
| New ticket | One main form column, optional contextual service help; required fields appear together; one submit action |
| Ticket detail | Header/status/actions; large conversation column; narrower details/SLA panel; internal notes/worklogs are explicitly separated when authorized |
| Approvals | Focused pending list; ticket context and explicit approve/reject confirmation |
| Assets | Filterable inventory; detail sections for summary, permitted custody, lifecycle history, and linked tickets |
| Notifications | Clear unread/read distinction, timestamp, safe resource link, mark-read action |
| Reports | Date/scope filters; precise summaries and tables; limited charts with real series |
| Administration | Separate access grants, audit, and health views; additional settings only when verified |

Desktop ticket detail starts near a 2:1 conversation-to-summary ratio and stacks on small screens. Use progressive disclosure for uncommon commands in an Actions menu. Keep consequential reasons and conflicts in a persistent dialog/page area rather than only a disappearing toast.

## 7. Route plan

Use the attached plan's route convention consistently. Do not mix the older `/app/...` prototype routes with these routes unless migration aliases are deliberately added.

| Route | Page / availability |
| --- | --- |
| `/sign-in` | Public sign-in |
| `/` | Authorized role/scope-aware dashboard |
| `/change-password` | Proposed forced-password-change route; validate against existing routing during Step 1 |
| `/tickets` | Personal/authorized ticket collection |
| `/tickets/new` | Request form once lookup dependencies are verified |
| `/tickets/:ticketId` | Authorized ticket detail/actions |
| `/queue` | Active support-scope queue |
| `/approvals` | Named approver inbox |
| `/assets` | Authorized inventory/own-assets view according to the contract |
| `/assets/:assetId` | Authorized asset detail/actions |
| `/notifications` | Recipient notifications |
| `/security` | Password and session management |
| `/reports` | Authorized reports |
| `/admin/access-grants` | Administrator grant lifecycle |
| `/admin/audit` | Administrator scoped audit explorer |
| `/admin/health` | Administrator operational health |

Activation/reset, user management, master-data settings, knowledge base, satisfaction, exports, and push notifications are added only after their real API contracts exist. A prototype page is not evidence that its backend capability exists.

## 8. Permission and error rules

- Role names provide context; current capabilities and organization/department scope govern operational UI. Named approval/requester relationships must also follow server authorization.
- Administrator does not automatically mean support, triage, supervision, or asset access.
- Assignment does not substitute for an active support grant.
- Department supervision does not grant internal notes or worklogs.
- The server filters data before serialization; hiding a tab in React is never the privacy boundary.
- Refetching identity after focus/security changes makes the UI current; server authorization remains effective on every request.

| Outcome | UX |
| --- | --- |
| Initial load | Structural skeleton |
| Valid zero results | Useful empty state with a permitted next action |
| 400/422 | Field errors or a visible form summary |
| Protected-session 401 | Clear/cancel private state and return to sign-in |
| 403 | Authorization message with no extra resource detail; revalidate identity as appropriate |
| Resource 404 | Shared missing-or-inaccessible state |
| Version-conflict 409 | Refetch, persistent notice, review, explicit new submission |
| 413 | Specific file/payload-size guidance |
| 429 | Throttling feedback; honor server retry guidance where supplied |
| Unexpected 5xx | Plain error, safe request ID, appropriate retry |
| Health 503 | Unavailable/degraded guidance while preserving the actual health evidence |

## 9. Completion rule for every step

An implemented slice is done only when its real backend calls, loading/empty/error states, current permission behavior, and relevant keyboard/mobile interactions work. Mutations use CSRF, versions, and idempotency where the contract requires them. Relevant checks, lint, and the production build pass. No unfinished backend dependency is presented as completed functionality.

## 10. Reusable implementation prompt

Use this instruction for each numbered step, adding that step's features and acceptance criteria:

> Implement only Step N from `Deskflow_Frontend_Implementation_Roadmap.md`. First inspect the current frontend, backend contract, and repository instructions. Keep React with plain JavaScript/JSX and the approved minimal blue theme. Reuse existing components and preserve backend authority for authentication, grants, workflows, approvals, SLA, and reports. Use real endpoints and allowlisted payloads. Do not invent APIs, statuses, permissions, hard-coded IDs, or completed functionality. Complete the step's loading, validation, error, conflict, responsive, and accessibility behavior. Run the relevant checks and update the implementation checklist with what passed and any exact dependency that remains blocked. Report the files changed and how to verify the behavior.

Start with Step 1. The first implementation batch is Steps 1–6; then connect Steps 7–10 into the first real ticket journey before expanding the rest.

## 11. Technical references

- [Vite environment variables](https://vite.dev/guide/env-and-mode): frontend-prefixed configuration is bundled into browser assets and must contain no secrets.
- [Vite development proxy configuration](https://vite.dev/config/server-options#server-proxy): use a development proxy aligned with the actual backend/origin policy.
- [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults): explicitly set retry/refetch behavior for this application.
- [WCAG 2.2 text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum): verify text and background combinations.
- [WCAG 2.2 non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): verify essential control boundaries and state indicators.
