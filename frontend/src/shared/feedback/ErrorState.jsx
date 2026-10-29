import { CircleAlert } from 'lucide-react'
import Button from '../components/Button.jsx'

export default function ErrorState({
  description = 'The information could not be loaded.',
  onRetry,
  requestId,
  title = 'Something went wrong',
}) {
  return (
    <div
      className="grid min-h-56 content-center justify-items-center gap-4 p-6 text-center"
      role="alert"
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-card bg-danger-soft text-danger [&_svg]:size-6"
      >
        <CircleAlert aria-hidden="true" />
      </span>
      <div className="grid max-w-[30rem] gap-2">
        <h3 className="text-section">{title}</h3>
        <p className="text-text-secondary">{description}</p>
        {requestId ? (
          <p className="font-mono text-meta text-text-secondary">Request ID: {requestId}</p>
        ) : null}
      </div>
      {onRetry ? (
        <div className="flex justify-center">
          <Button onClick={onRetry} variant="secondary">
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  )
}
