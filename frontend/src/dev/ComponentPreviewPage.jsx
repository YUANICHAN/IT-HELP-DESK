import { useMemo, useState } from 'react'
import {
  Bell,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react'
import Badge from '../shared/components/Badge.jsx'
import Button from '../shared/components/Button.jsx'
import Card, { CardHeader } from '../shared/components/Card.jsx'
import Checkbox from '../shared/components/Checkbox.jsx'
import ConfirmDialog from '../shared/components/ConfirmDialog.jsx'
import DataTable from '../shared/components/DataTable.jsx'
import IconButton from '../shared/components/IconButton.jsx'
import Input from '../shared/components/Input.jsx'
import PageHeader from '../shared/components/PageHeader.jsx'
import Pagination from '../shared/components/Pagination.jsx'
import Select from '../shared/components/Select.jsx'
import Skeleton from '../shared/components/Skeleton.jsx'
import Spinner from '../shared/components/Spinner.jsx'
import Textarea from '../shared/components/Textarea.jsx'
import ConflictNotice from '../shared/feedback/ConflictNotice.jsx'
import EmptyState from '../shared/feedback/EmptyState.jsx'
import ErrorState from '../shared/feedback/ErrorState.jsx'
import { useToast } from '../shared/feedback/useToast.js'
import {
  previewServiceOptions,
  previewSummary,
  previewTickets,
} from './fixtures/componentPreview.js'

const statusPresentation = {
  NEW: { label: 'New', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  WAITING_REQUESTER: { label: 'Waiting for requester', tone: 'warning' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
}

const priorityTone = {
  P1: 'danger',
  P2: 'warning',
  P3: 'info',
  P4: 'neutral',
}

const pageSize = 3

function SummaryCard({ label, note, tone, value }) {
  const iconByTone = {
    info: Wrench,
    warning: Clock3,
    success: CheckCircle2,
    neutral: Bell,
  }
  const Icon = iconByTone[tone]

  return (
    <Card className="grid gap-2" padding="compact">
      <div className="flex items-center justify-between gap-3 text-table font-medium text-text-secondary">
        <p>{label}</p>
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-hover [&_svg]:size-[1.125rem]"
        >
          <Icon aria-hidden="true" />
        </span>
      </div>
      <p className="text-[1.75rem] leading-tight font-semibold">{value}</p>
      <p className="text-meta text-text-muted">{note}</p>
    </Card>
  )
}

export default function ComponentPreviewPage() {
  const [page, setPage] = useState(1)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { showToast } = useToast()

  const rows = previewTickets.slice((page - 1) * pageSize, page * pageSize)
  const columns = useMemo(
    () => [
      {
        key: 'reference',
        header: 'Ticket',
        render: (ticket) => (
          <div className="grid min-w-56 gap-1">
            <a className="w-fit font-semibold" href={`#${ticket.id}`}>
              {ticket.reference}
            </a>
            <span className="text-text-secondary">{ticket.title}</span>
          </div>
        ),
      },
      { key: 'category', header: 'Service category' },
      {
        key: 'status',
        header: 'Status',
        render: (ticket) => {
          const presentation = statusPresentation[ticket.status]
          return <Badge tone={presentation.tone}>{presentation.label}</Badge>
        },
      },
      {
        key: 'priority',
        header: 'Priority',
        render: (ticket) => <Badge tone={priorityTone[ticket.priority]}>{ticket.priority}</Badge>,
      },
      { key: 'assetTag', header: 'Asset tag' },
      { key: 'updated', header: 'Updated' },
    ],
    [],
  )

  function confirmRemoval() {
    setConfirmOpen(false)
    showToast('Synthetic ticket DF-1048 was removed from the preview.', {
      duration: 3200,
    })
  }

  return (
    <main className="min-h-screen p-8 max-sm:p-4">
      <div className="mx-auto grid w-full max-w-content gap-12 max-sm:gap-8">
        <PageHeader
          actions={
            <>
              <IconButton label="Preview notifications" variant="secondary">
                <Bell aria-hidden="true" />
              </IconButton>
              <Button startIcon={<Plus aria-hidden="true" />}>New ticket</Button>
            </>
          }
          description="A development-only gallery for Deskflow’s shared visual and interaction patterns. All records and decisions on this page are synthetic fixtures."
          eyebrow="Step 3 · Development preview"
          title="Deskflow Blue component gallery"
        />

        <aside className="rounded-card border border-primary bg-primary-soft px-4 py-3 text-primary-hover">
          <strong>Preview only.</strong> Service choices, ticket references, assets, and approval decisions below are not production data and do not call the API.
        </aside>

        <section aria-labelledby="buttons-heading" className="grid min-w-0 gap-4">
          <div className="grid gap-1 [&_h2]:text-xl [&_p]:text-text-secondary">
            <h2 id="buttons-heading">Actions and status</h2>
            <p>Buttons keep a comfortable target, clear labels, and visible pending or disabled state.</p>
          </div>
          <Card>
            <div className="flex flex-wrap items-center gap-3 max-sm:[&>button:not([aria-label])]:grow">
              <Button>Primary action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost action</Button>
              <Button startIcon={<Trash2 aria-hidden="true" />} variant="destructive">
                Remove
              </Button>
              <Button disabled>Disabled</Button>
              <Button pending pendingLabel="Saving ticket…">
                Save ticket
              </Button>
              <IconButton label="Refresh preview" variant="secondary">
                <RefreshCw aria-hidden="true" />
              </IconButton>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Badge tone="neutral">New</Badge>
              <Badge tone="info">In progress</Badge>
              <Badge tone="warning">Waiting for requester</Badge>
              <Badge tone="success">Approved</Badge>
              <Badge tone="danger">Rejected</Badge>
              <Badge tone="danger">P1</Badge>
              <Badge tone="warning">P2</Badge>
            </div>
          </Card>
        </section>

        <section aria-labelledby="summary-heading" className="grid min-w-0 gap-4">
          <div className="grid gap-1 [&_h2]:text-xl [&_p]:text-text-secondary">
            <h2 id="summary-heading">Summary cards</h2>
            <p>Compact operational totals stay readable without dashboard decoration.</p>
          </div>
          <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {previewSummary.map((item) => (
              <SummaryCard key={item.label} {...item} />
            ))}
          </div>
        </section>

        <section aria-labelledby="forms-heading" className="grid min-w-0 gap-4">
          <div className="grid gap-1 [&_h2]:text-xl [&_p]:text-text-secondary">
            <h2 id="forms-heading">Form controls</h2>
            <p>Visible labels, help text, native controls, and persistent validation remain associated.</p>
          </div>
          <Card>
            <form
              className="grid grid-cols-2 gap-6 max-sm:grid-cols-1"
              onSubmit={(event) => event.preventDefault()}
            >
              <Input
                defaultValue="Printer on level 3 is unavailable"
                helpText="Use a short summary that identifies the affected service."
                label="Ticket title"
                required
              />
              <Select
                defaultValue="hardware"
                helpText="Synthetic choices shown for component review only."
                label="Service category"
                options={previewServiceOptions}
                required
              />
              <Input defaultValue="AST-LT-2048" label="Asset tag" />
              <Select disabled label="Approval decision" placeholder="Decision unavailable" />
              <div className="col-span-full max-sm:col-auto">
                <Textarea
                  defaultValue="Can you help?"
                  error="Add at least 20 characters so support has enough detail."
                  helpText="Describe what happened, when it started, and any steps already tried."
                  label="Description"
                  required
                  rows="5"
                />
              </div>
              <div className="col-span-full max-sm:col-auto">
                <Checkbox
                  helpText="This changes only the synthetic preview control."
                  label="Notify me when the ticket is updated"
                />
              </div>
              <div className="col-span-full flex flex-wrap items-center gap-3 max-sm:col-auto max-sm:[&>button]:grow">
                <Button type="submit">Submit ticket</Button>
                <Button type="reset" variant="secondary">
                  Clear form
                </Button>
              </div>
            </form>
          </Card>
        </section>

        <section aria-labelledby="table-heading" className="grid min-w-0 gap-4">
          <div className="grid gap-1 [&_h2]:text-xl [&_p]:text-text-secondary">
            <h2 id="table-heading">Ticket table</h2>
            <p>The table and pagination are controlled entirely by this preview parent.</p>
          </div>
          <Card padding="compact">
            <DataTable
              caption="Synthetic help desk tickets"
              captionHidden
              columns={columns}
              isRowSelected={(ticket) => ticket.reference === 'DF-1048'}
              rows={rows}
            />
            <Pagination
              label="Synthetic ticket pages"
              onPageChange={setPage}
              page={page}
              pageSize={pageSize}
              totalItems={previewTickets.length}
              totalPages={Math.ceil(previewTickets.length / pageSize)}
            />
          </Card>
        </section>

        <section aria-labelledby="states-heading" className="grid min-w-0 gap-4">
          <div className="grid gap-1 [&_h2]:text-xl [&_p]:text-text-secondary">
            <h2 id="states-heading">Loading, empty, and error states</h2>
            <p>Structural loading is quiet; valid empty data and failures have different messages.</p>
          </div>
          <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
            <Card>
              <CardHeader description="Skeletons preserve the expected structure." title="Loading tickets" />
              <div className="mt-6 flex items-start gap-3">
                <Spinner label="Loading synthetic tickets" />
                <div className="grid flex-1 gap-3">
                  <Skeleton height="1.25rem" width="70%" />
                  <Skeleton width="100%" />
                  <Skeleton width="86%" />
                </div>
              </div>
            </Card>
            <Card padding="none">
              <EmptyState
                action={<Button variant="secondary">Clear filters</Button>}
                description="No synthetic tickets match the selected filters."
                title="No tickets found"
              />
            </Card>
            <Card padding="none">
              <ErrorState
                description="The synthetic ticket list could not be displayed."
                onRetry={() => showToast('Preview retry requested.', { tone: 'info' })}
                requestId="preview-req-84b2"
                title="Tickets are unavailable"
              />
            </Card>
          </div>
        </section>

        <section aria-labelledby="feedback-heading" className="grid min-w-0 gap-4">
          <div className="grid gap-1 [&_h2]:text-xl [&_p]:text-text-secondary">
            <h2 id="feedback-heading">Persistent and brief feedback</h2>
            <p>Conflicts remain in context; short confirmations can use a polite toast.</p>
          </div>
          <ConflictNotice onReview={() => showToast('Latest synthetic version loaded.', { tone: 'info' })} />
          <Card>
            <div className="flex flex-wrap items-center gap-3 max-sm:[&>button:not([aria-label])]:grow">
              <Button onClick={() => setConfirmOpen(true)} variant="destructive">
                Open confirmation dialog
              </Button>
              <Button onClick={() => showToast('Ticket DF-1048 saved successfully.')} variant="secondary">
                Show confirmation toast
              </Button>
            </div>
          </Card>
        </section>
      </div>

      <ConfirmDialog
        confirmLabel="Remove synthetic ticket"
        description="This demonstrates a consequential confirmation. No production record will be changed."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmRemoval}
        open={confirmOpen}
        title="Remove DF-1048 from the preview?"
        variant="destructive"
      />
    </main>
  )
}
