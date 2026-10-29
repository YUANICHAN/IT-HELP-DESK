import FormError from '../feedback/FormError.jsx'

export function FieldLayout({
  children,
  error,
  errorId,
  helpId,
  helpText,
  inputId,
  label,
  required,
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <label
        className="flex items-baseline justify-between gap-3 font-semibold text-text"
        htmlFor={inputId}
      >
        <span>{label}</span>
        {required ? (
          <span className="text-meta font-medium text-text-muted">Required</span>
        ) : null}
      </label>
      {children}
      {helpText ? (
        <p className="text-meta text-text-secondary" id={helpId}>
          {helpText}
        </p>
      ) : null}
      <FormError id={errorId} message={error} />
    </div>
  )
}
