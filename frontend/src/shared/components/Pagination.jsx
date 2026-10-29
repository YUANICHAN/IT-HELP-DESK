import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button.jsx'

export default function Pagination({
  label = 'Pagination',
  onPageChange,
  page,
  pageSize,
  totalItems,
  totalPages,
}) {
  const safeTotalPages = Math.max(1, totalPages)
  const canGoBack = page > 1
  const canGoForward = page < safeTotalPages
  const firstItem = totalItems > 0 ? (page - 1) * pageSize + 1 : 0
  const lastItem = totalItems > 0 ? Math.min(page * pageSize, totalItems) : 0

  return (
    <nav
      aria-label={label}
      className="flex items-center justify-between gap-4 pt-4 max-sm:flex-col max-sm:items-stretch"
    >
      <p aria-live="polite" className="text-table text-text-secondary">
        {Number.isFinite(totalItems) && Number.isFinite(pageSize)
          ? `Showing ${firstItem}–${lastItem} of ${totalItems}`
          : `Page ${page} of ${safeTotalPages}`}
      </p>
      <div className="flex items-center gap-3 max-sm:grid max-sm:grid-cols-[1fr_auto_1fr] max-sm:[&_button_span]:hidden">
        <Button
          aria-label="Go to previous page"
          disabled={!canGoBack}
          onClick={() => onPageChange(page - 1)}
          startIcon={<ChevronLeft aria-hidden="true" />}
          variant="secondary"
        >
          Previous
        </Button>
        <span className="min-w-28 text-center text-table text-text-secondary">
          Page <strong>{page}</strong> of {safeTotalPages}
        </span>
        <Button
          aria-label="Go to next page"
          disabled={!canGoForward}
          endIcon={<ChevronRight aria-hidden="true" />}
          onClick={() => onPageChange(page + 1)}
          variant="secondary"
        >
          Next
        </Button>
      </div>
    </nav>
  )
}
