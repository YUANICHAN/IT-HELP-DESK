import { forwardRef, useId } from 'react'
import FormError from '../feedback/FormError.jsx'

const Checkbox = forwardRef(function Checkbox(
  {
    className = '',
    error,
    helpText,
    id,
    label,
    'aria-describedby': describedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId()
  const inputId = id || `checkbox-${generatedId}`
  const helpId = helpText ? `${inputId}-help` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const ariaDescribedBy = [describedBy, helpId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={['grid gap-1', className].filter(Boolean).join(' ')}>
      <label
        className="inline-flex min-h-control w-fit max-w-full cursor-pointer items-center gap-3 font-medium text-text [&:has(:disabled)]:cursor-not-allowed [&:has(:disabled)]:opacity-[0.65]"
        htmlFor={inputId}
      >
        <input
          {...props}
          aria-describedby={ariaDescribedBy}
          aria-invalid={error ? true : props['aria-invalid']}
          className="m-0 size-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
          id={inputId}
          ref={ref}
          type="checkbox"
        />
        <span>{label}</span>
      </label>
      {helpText ? (
        <p className="ml-8 text-meta text-text-secondary" id={helpId}>
          {helpText}
        </p>
      ) : null}
      <FormError id={errorId} message={error} />
    </div>
  )
})

export default Checkbox
