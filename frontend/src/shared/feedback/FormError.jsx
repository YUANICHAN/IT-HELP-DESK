import { AlertCircle } from 'lucide-react'

export default function FormError({ id, message }) {
  if (!message) return null

  return (
    <p
      className="flex items-start gap-2 text-meta font-medium text-danger"
      id={id}
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
      <span>{message}</span>
    </p>
  )
}
