# Deskflow Blue design system

## Status and intent

Deskflow Blue is the approved light-theme direction for the IT Help Desk and Asset Management frontend. It adapts the requested clean service-management reference language to the backend-supported workflows documented in [api-contract.md](api-contract.md). No reference image file is present in the repository, so this specification records the supplied visual requirements rather than claiming pixel comparison against an asset.

Step 3 implements this contract through the CSS-first Tailwind theme in `src/styles/tailwind.css`, utility classes in the shared components under `src/shared/components` and `src/shared/feedback`, and the development-only gallery under `src/dev`. The application shell remains intentionally deferred to Step 6.

## Product character

Deskflow should feel calm, precise, and operational:

- White full-height navigation, flush to the left edge.
- Pale neutral application canvas.
- White cards with subtle borders and restrained shadows.
- Pale-blue active navigation with blue text/icon.
- Compact contextual header with notifications and profile controls.
- Clear hierarchy, generous spacing, and consistent line icons.
- Status always conveyed by text in addition to color.
- Light theme first; no unverified dark-theme promise.

Avoid decorative browser chrome, a floating application frame, large empty illustration panels, saturated gradients, and dense dashboard decoration. Every card should answer a supported help-desk question or provide a supported action.

## Color tokens

| Purpose / suggested token | Value | Usage |
| --- | --- | --- |
| Primary / `--color-primary` | `#2563EB` | Primary actions, links, selected controls, focus |
| Primary hover / `--color-primary-hover` | `#1D4ED8` | Hover/pressed primary controls, active text |
| Soft blue / `--color-primary-soft` | `#EFF6FF` | Active navigation, selected filters, quiet information |
| Application background / `--color-surface-app` | `#F8FAFC` | Main content canvas |
| Surface / `--color-surface` | `#FFFFFF` | Sidebar, header, cards, dialogs, inputs |
| Main text / `--color-text` | `#0F172A` | Headings and body |
| Secondary text / `--color-text-secondary` | `#475569` | Labels and supporting copy |
| Muted text / `--color-text-muted` | `#64748B` | Timestamps and lower-priority metadata |
| Decorative divider / `--color-border` | `#E2E8F0` | Card/table separators; not sufficient alone for a control |
| Essential control border / `--color-control-border` | `#64748B` | Inputs/selects and other boundaries essential to recognition |
| Success / `--color-success` | `#15803D` | Success/status text |
| Success soft / `--color-success-soft` | `#DCFCE7` | Success badge background |
| Warning / `--color-warning` | `#92400E` | Attention/waiting text |
| Warning soft / `--color-warning-soft` | `#FEF3C7` | Attention/waiting background |
| Danger / `--color-danger` | `#B91C1C` | Error, breach, destructive action text |
| Danger soft / `--color-danger-soft` | `#FEE2E2` | Error/breach background |

Blue is the brand color. Green, amber, and red are reserved for operational meaning. Do not use green as a generic decorative accent or red for priority alone.

Starting contrast calculations from the approved roadmap are approximately: white on primary blue 5.17:1; primary-hover text on soft blue 6.16:1; secondary text on application background 7.24:1; success, warning, and danger text on their soft backgrounds 4.57:1, 6.37:1, and 5.30:1. These are design inputs, not a substitute for rendered contrast testing.

## Typography and dimensions

| Element | Starting specification |
| --- | --- |
| Font | `system-ui, -apple-system, "Segoe UI", sans-serif` |
| General body and form text | 16 px; line-height about 1.5 |
| Page heading | 24–28 px; weight 600 |
| Section/card heading | 16–18 px; weight 600 |
| Table text | 14 px minimum with comfortable row height |
| Metadata | 12–13 px; never the sole format for critical information |
| Desktop sidebar | About 240 px |
| Optional compact sidebar | About 72 px; icons still require accessible names/tooltips |
| Header | About 64 px minimum; allowed to grow when content wraps/zooms |
| Desktop content padding | 24–32 px |
| Mobile content padding | 16 px |
| Card corners | 12 px |
| Input/button corners | 8 px |
| Dialog corners | 16 px |
| Card shadow | `0 1px 3px rgb(15 23 42 / 0.04)` |
| Target size | Prefer at least 44 × 44 px for primary touch controls |
| Focus | Visible 2 px primary-blue outline with 2 px offset |

Spacing scale: 4, 8, 12, 16, 24, 32, and 48 px. Use the scale consistently; do not invent one-off gaps to align individual pages.

The implemented core tokens are below. The `@theme` block in `src/styles/tailwind.css` is authoritative and generates matching Tailwind utilities such as `bg-surface`, `text-text-secondary`, `border-control-border`, `rounded-card`, and `shadow-dialog`. It also defines semantic inverse/strong-border roles, typography, focus, control dimensions, restrained dialog elevation, and future Step 6 shell dimensions.

```css
@theme {
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-soft: #eff6ff;
  --color-surface-app: #f8fafc;
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
  --text-page: clamp(1.5rem, 2vw + 1rem, 1.75rem);
  --text-section: 1.0625rem;
  --text-table: 0.875rem;
  --text-meta: 0.8125rem;
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-dialog: 16px;
  --shadow-card: 0 1px 3px rgb(15 23 42 / 0.04);
  --spacing-control: 44px;
  --spacing-sidebar: 240px;
  --spacing-header: 64px;
}

:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

## Implemented shared components

Shared components are presentational, use Tailwind utility classes directly, and import no feature or page code. Pages and features own records, callbacks, permissions, fetching, URL state, and mutation behavior. Tailwind 4 is integrated through the official `@tailwindcss/vite` plugin; no JavaScript Tailwind configuration file is required for the CSS-first theme.

| Component | Primary usage | Variants and states | Accessibility behavior |
| --- | --- | --- | --- |
| `Button` | Form and page actions | `primary`, `secondary`, `ghost`, `destructive`; disabled and pending | Native button semantics; pending sets `disabled` and `aria-busy`, changes to a visible pending label, and prevents duplicate activation |
| `IconButton` | Compact recognizable actions | Uses the button variants | Requires a non-empty `label`, supplies an accessible name/title, and retains the normal 44 px target |
| `Input`, `Select`, `Textarea` | Labelled form fields | Help, required, disabled, and error states; `Select` remains native | Generate stable label/help/error associations, merge caller `aria-describedby`, and set `aria-invalid` for persistent errors |
| `Checkbox` | Boolean choices | Help, disabled, and error states | Native checkbox inside a clickable visible label; help/error descriptions remain associated |
| `Card`, `CardHeader` | Surface and section composition | Standard, compact, or no internal padding | Does not impose an incorrect landmark; callers choose the rendered element and heading context |
| `PageHeader` | One page title, context, and actions | Optional eyebrow, description, and wrapping action group | Renders the page `h1`; actions wrap rather than clip at narrow widths |
| `Badge` | Explicit operational labels | `neutral`, `info`, `success`, `warning`, `danger` | Always contains visible text; color is reinforcing information, never the only status signal |
| `DataTable` | Parent-supplied tabular records | Comfortable/compact density, selected, loading, and empty rows | Uses native table/headings/caption semantics; wide content is contained in a named keyboard-scrollable region |
| `Pagination` | Parent-controlled page requests | Previous/next disabled at bounds; optional result range | Native navigation label, explicit button names, and a polite current-range announcement; never fetches data |
| `Skeleton`, `Spinner` | Structural and indeterminate loading | Configurable skeleton dimensions and spinner size | Skeleton is decorative; spinner has a screen-reader label unless deliberately embedded as decorative content |
| `Dialog` | Modal tasks | Small/medium/large; dismissable or safe non-dismissable state | Labelled title/description, initial focus, Tab loop, safe Escape/backdrop behavior, body-scroll lock, and opener focus restoration |
| `ConfirmDialog` | Consequential confirmation | Primary or destructive confirm, pending state | Places initial focus on Cancel and blocks dismissal/duplicate confirmation while pending |
| `EmptyState`, `ErrorState` | Valid empty results and load failures | Optional permitted action/retry and safe request ID | Empty data is not announced as an error; failure uses a persistent alert and keeps diagnostics safe |
| `FormError`, `ConflictNotice` | Required persistent feedback | Field error or version-conflict review action | Errors are linked to fields; conflicts use a polite persistent status rather than a disappearing toast |
| `ToastProvider` / `useToast` | Brief confirmations | Success and informational messages; bounded queue and duration | Toasts use polite status announcements and provide a labelled dismiss action; never use them as the only conflict/error location |

Typical focused usage:

```jsx
<Input
  label="Ticket title"
  helpText="Summarize the affected service."
  error={errors.title}
  required
/>

<Button pending={isSubmitting} pendingLabel="Submitting ticket…">
  Submit ticket
</Button>

<DataTable caption="Authorized tickets" columns={columns} rows={tickets} />
<Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
```

`DataTable` column renderers may render links or badges, but the component does not infer permissions, fetch rows, choose filters, or make a whole row act like a link. `Pagination` reports the requested page to its parent and does not normalize backend response shapes. Status-to-tone mapping stays with the owning domain so ticket, approval, asset, SLA, attachment, and health vocabularies remain separate.

## Development component gallery

Start Vite and open the gallery:

```powershell
cd frontend
npm run dev
```

Then visit `http://127.0.0.1:5173/dev/components`, or use the **Open component gallery** link on the foundation page. The route is registered only when `import.meta.env.DEV` is true; the production build falls through to the existing not-found route.

The gallery includes synthetic, clearly labelled ticket references, P1–P4 priorities, backend-verified ticket statuses, service-category examples, asset tags, approval decisions, summary cards, controlled pagination, loading/empty/error states, a conflict notice, a keyboard dialog, and a short confirmation toast. Fixtures live in `src/dev/fixtures/componentPreview.js` and are not imported by production feature modules.

The gallery is designed for direct review at 360, 768, 1024, and 1440 px. Wide tables scroll within their own region; the document itself must not gain horizontal overflow. The eventual white sidebar remains flush to the left viewport edge, but its navigation, header, drawer, and responsive policy are Step 6 work.

## Application shell

### Desktop

- Sidebar is fixed or sticky, full viewport height, 240 px wide, white, flush to the left, with a thin right divider.
- Brand block shows the Deskflow wordmark and a compact service/help-desk mark. Keep it text-capable; the product must not depend on an image logo.
- Navigation groups are generated from one route metadata source and filtered by current identity/grants. Pale-blue active item includes icon and visible label.
- Header occupies the content column, has a white or canvas-compatible surface, and shows page title/context on the left. Notification and profile controls sit on the right. It must wrap rather than clip at zoom.
- Main canvas is `#F8FAFC`; content uses a readable maximum width only where it helps forms or detail pages. Tables and operational workspaces may use the full available width.

### Responsive behavior

- At tablet widths, collapse the sidebar to a modal drawer or compact rail. Preserve the current page label and notification/profile controls.
- At mobile widths, use a drawer and/or a small bottom navigation containing only the most important authorized destinations. “More” opens the full authorized menu. Do not duplicate divergent navigation policy.
- Ticket detail changes from approximately 2:1 conversation/details columns to one column, conversation first and information/SLA in collapsible sections below.
- Filter bars wrap into rows or open a filter sheet. Active filters remain visible as text chips with clear controls.
- Tables either become semantic record cards or use a labeled, contained horizontal scroll region. Never shrink text below the minimum to force a table on screen.
- Dialogs become near-full-width sheets when space is limited. Focus trapping, heading association, close control, and focus restoration remain required.

## Navigation and header

Approved browser routes:

- Public: `/sign-in`.
- Forced auth: `/change-password`.
- Authenticated: `/`, `/tickets`, `/tickets/new`, `/tickets/:ticketId`, `/queue`, `/approvals`, `/assets`, `/assets/:assetId`, `/notifications`, `/security`, `/reports`.
- Administrator: `/admin/access-grants`, `/admin/audit`, `/admin/health`.

Unavailable settings, user management, knowledge base, satisfaction, and exports are omitted from primary navigation. Do not show disabled navigation for speculative features unless a product roadmap view is intentionally designed later.

Header controls:

- Page title plus short context such as department or selected period.
- Notification button with the server-provided unread count. Its accessible name includes the count.
- Profile menu with identity, department, Security, and Sign out.
- No global search field: the backend has only screen-local ticket and asset search.

## Core component language

### Buttons and links

- One clear primary action per page/form region.
- Secondary actions use bordered or quiet buttons. Destructive actions use danger styling and explicit labels.
- Link styling remains distinguishable without relying only on color.
- Icon-only controls are limited to universally recognizable compact actions and still require accessible names and adequate target size.

### Forms

- Every control has a persistent visible label; placeholder text is supplementary.
- Group related fields with a heading and short help text. Mark required state in text.
- Inline error appears adjacent to the field and a form summary appears for multi-field/backend errors.
- Preserve entered values on validation, authorization, service, and conflict failures where safe.
- One primary submit action. Disable duplicate submission while pending, but do not erase content.
- Lookup-backed fields use real authorized choices. Screens blocked by missing lookups are not production forms and must never ship with hard-coded IDs.

### Cards and summaries

- White surface, 1 px decorative border, 12 px radius, restrained shadow.
- Summary cards show a plain label, value, and optional contextual note. Avoid oversized marketing numbers.
- A status card never uses background color alone; include label, icon where useful, and supporting text.

### Tables and lists

- Server-paginated lists have compact filter controls, result count, clear column headers, readable rows, empty/error/loading states, and pagination.
- Ticket rows prioritize reference, title, status, priority, requester/assignee as authorized, and updated/submitted time.
- Asset rows prioritize tag, category/model, status, condition, department/location identifiers or returned labels, and viewer-appropriate custody/financial context.
- Row click may open detail, but the reference/tag remains a real keyboard-operable link.
- Skeletons match structure. A valid empty result is not rendered as an error.

### Badges and operational status

- Use compact text badges with both foreground and soft background colors.
- Map actual backend values only. Do not invent “On hold,” “Escalated,” “At risk,” or other states unless they are derived with an explicitly documented presentation rule.
- Ticket status, approval status, asset status/condition, SLA metric status, attachment state/scan status, and health component state keep separate vocabularies.
- P1–P4 priority should use label and optionally restrained emphasis. Do not equate every P1 with an SLA breach.

Starting semantic mappings, always paired with the literal status label:

| Domain | Mapping |
| --- | --- |
| Ticket | `NEW`/`OPEN` neutral or soft blue; `IN_PROGRESS` primary blue; waiting states soft warning; `RESOLVED`/`CLOSED` success; `REJECTED` danger; `CANCELLED` muted |
| Approval | `PENDING` warning; `APPROVED` success; `REJECTED` danger; `SUPERSEDED` muted |
| Asset | `AVAILABLE` success; `ASSIGNED` primary; `UNDER_REPAIR` warning; `LOST` danger; `RETIRED` muted |
| SLA | `RUNNING` primary; `PAUSED` warning; `MET` success; `BREACHED` danger; `STOPPED`/`EXCLUDED` muted |
| Attachment | `PENDING` warning; `READY` success; `REJECTED`/`INFECTED`/`ERROR` danger; `DELETED` muted; `NOT_CONFIGURED` explicit warning/unknown treatment, never clean |
| Health | Preserve exact `healthy`, `degraded`, `unavailable`, `unknown`, and `not-configured`; only `healthy` uses success |

### Feedback

- Toasts confirm transient successful actions. They are not the sole location for conflicts, destructive consequences, upload failures, or required next steps.
- Version conflicts appear in a persistent notice/dialog: explain that the record changed, refetch, show current state, and let the user explicitly try again.
- Unexpected errors show the safe request ID.
- `404` resource pages say “This item is unavailable or you no longer have access,” avoiding existence disclosure.

## Supported screen composition

### Sign in and forced password change

- Quiet Deskflow brand area and one centered form card.
- Visible email/password labels, password visibility control with accessible state, inline error, and one primary action.
- Forced password change explains the 12–128 character policy, requires current/new password, and keeps Sign out available.
- Do not add forgot-password or activation links until APIs exist.

### Dashboard

Render only returned dashboard sections. Approved compositions:

- Personal: active tickets, waiting for my reply, awaiting confirmation, recent resolutions, assigned equipment, recent public updates.
- Technician: assigned active, eligible unassigned, resolved by me in period, assigned work, response/resolution SLA attention.
- Supervisor supervision: backlog, approvals assigned to me, aging over seven calendar days, recurring equipment issues.
- Triage: backlog, due work, breached work, workload distribution, response/resolution summaries, target attainment.
- Administrator: operational health summary, account-status counts, and configuration issue counts.

Use 3–4 relevant totals first, then recent work and attention panels. Do not show global ticket totals to an administrator unless the API returns authorized global data. A “New ticket” action may appear, but remains blocked from production completion until service/location lookups exist.

### My Tickets and Queue

- Page heading and permitted primary action.
- Compact filters: local search, status, type, date range, sort; queue uses only the same supported filters.
- Readable server-paginated rows with status and priority badges.
- Mobile record cards retain reference, title, status, priority, and time.
- No department filter is shown because ticket list/queue APIs do not accept it.

### New ticket

- One main form column with grouped service/request details, location, description, urgency, optional eligible assets, and optional follow-up.
- Service choice drives any later location/asset choices. Do not render this as production-ready until real service and location discovery APIs exist.
- Exactly one Submit ticket action. Preserve draft on backend relationship/configuration errors.

### Ticket detail

Desktop starts near a 2:1 conversation-to-side-panel ratio:

```text
Ticket header: reference, title, status, priority, authorized actions
├─ Main: public conversation, reply composer, attachments
│  └─ Staff-only internal notes/worklogs shown as a clearly separate mode
└─ Side: requester/service/location/assignment, asset snapshots, approval, SLA
   └─ Secondary sections: events and approval history
```

- Public conversation is the primary reading flow.
- Internal notes use an unmistakable staff-only label, icon, and different quiet background. Do not default a requester-facing reply to internal or vice versa.
- Use an Actions menu for uncommon transitions; keep the most likely permitted action visible.
- SLA panel uses server statuses, business seconds, due-authoritative flag, pause state, breach history, cycles, and reconciliation message. Never animate a browser-computed countdown as authoritative.
- Approval history is a structured section. Reroute only appears to triage and is disabled as a production control until eligible approver lookup exists.
- Attachment metadata and downloads remain protected actions; show scanning/pending state text.

### Approvals

- Focused inbox with pending first, safe ticket context, requester, priority, request date, and status.
- Decision opens a confirmation area with Approve/Reject and required rejection note.
- History distinguishes decided and superseded rounds. Do not expose triage-only supersede details to other viewers.
- Automatic fallback is explained only when an API result/error makes it relevant; it is not a user-selectable workflow.

### Assets

- Inventory uses filterable server-paginated table/cards and respects `OWN`, `SCOPED`, and `MANAGER` representations.
- Detail sections: identity/status/condition; viewer-appropriate custody; manager financial fields; lifecycle history; linked tickets.
- Manager commands are grouped by custody and lifecycle. Consequential state changes use confirmation with reason/reference.
- Create/edit/assign screens remain blocked until department/location/custodian lookups exist. Return and lifecycle commands can be built where their current safe choices are available.

### Notifications

- Header menu shows a short latest list and link to the full page.
- Page clearly distinguishes unread/read with text/weight, timestamp, title, and safe internal link.
- Use resource type/id to route to the Deskflow screen; do not navigate to the API URL returned in `resource.link`.
- No typing, live presence, push, or instant-delivery claim. Loading/refetch state should be honest.

### Reports

- Date/scope filters followed by precise summary tables.
- Separate current backlog/current overdue workload from completed-period measures.
- Place cohort, unit, sample size, exclusions, numerator/denominator, unanswered/unresolved, and reconciliation counts next to the metric.
- Render null as “No data,” never 0%.
- Simple charts are allowed only for returned categorical aggregates and must have a text/table equivalent. Trend charts and export require new APIs.

### Administration

- Separate focused pages for access grants, audit, and health.
- Access grants show recipient, capability, scope, active/revoked state, grant/revoke actors and times. Lifecycle is create/revoke, never edit. Create remains blocked without recipient/department lookup.
- Audit explorer supports only returned authentication/access actions and safe metadata. Do not hydrate it with extra entity calls.
- Health displays overall state plus component cards for database, worker, delivery, outbox, SLA scheduler, cleanup, storage, and backup. Preserve `healthy`, `degraded`, `unavailable`, `unknown`, and `not-configured` exactly, with observation times and diagnostic codes.
- No account, department, location, service, calendar, or SLA-policy settings page until the matching backend APIs exist.

## Accessibility acceptance requirements

- All controls and routes are keyboard reachable in a logical order; no keyboard trap outside an intentional modal.
- `:focus-visible` is never clipped by overflow or hidden beneath sticky UI.
- Sidebar drawer/dialog returns focus to its opener. Route changes move focus to the page heading or a deliberate main landmark.
- Use semantic landmarks, one page-level heading, real buttons/links, fieldsets/legends where groups need them, and table semantics where data is tabular.
- Status, priority, health, read state, selected state, validation, and SLA breach are understandable without color.
- Loading, mutation success/failure, pagination changes, and validation summaries have appropriate live announcements without excessive interruption.
- Support 200% browser zoom and narrow reflow without loss of controls/content. Header height is not fixed.
- Respect `prefers-reduced-motion`; suppress nonessential transitions and never use motion as the only state signal.
- Verify text contrast and non-text contrast in rendered components. Decorative `#E2E8F0` borders cannot be the sole boundary for essential inputs; use `#64748B` or another compliant treatment.

## Capabilities that need more API support

- Global search: no cross-resource endpoint.
- Trend charts: no time series.
- Live conversation: no WebSocket/SSE/presence/read receipts.
- Exports: no CSV or export-history endpoints.
- Service/location/department/user choice controls: missing discovery contracts; see the dependency register in [api-contract.md](api-contract.md).
- Knowledge base and satisfaction: no backend capabilities.

These dependencies should remain absent or explicitly disabled roadmap items, never represented by mock production widgets.

