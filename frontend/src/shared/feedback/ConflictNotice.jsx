import { RefreshCw, TriangleAlert } from 'lucide-react'
import Button from '../components/Button.jsx'

export default function ConflictNotice({
  actionLabel = 'Review latest version',
  message = 'This record changed after you opened it. Review the latest version before trying again.',
  onReview,
  title = 'A newer version is available',
}) {
  return (
    <section
      aria-live="polite"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-card border border-warning bg-warning-soft p-4 text-warning max-sm:grid-cols-[auto_minmax(0,1fr)]"
      role="status"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5" />
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-inherit">{title}</h2>
        <p>{message}</p>
      </div>
      {onReview ? (
        <div className="max-sm:col-span-full">
          <Button
            onClick={onReview}
            startIcon={<RefreshCw aria-hidden="true" />}
            variant="secondary"
          >
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
