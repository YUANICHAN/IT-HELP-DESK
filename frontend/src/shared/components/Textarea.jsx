import { forwardRef } from 'react'
import { FieldLayout } from './FieldLayout.jsx'
import { useFieldMetadata } from './useFieldMetadata.js'
import { formControlClasses } from './formControlClasses.js'

const Textarea = forwardRef(function Textarea(
  {
    className = '',
    error,
    helpText,
    id,
    label,
    required = false,
    'aria-describedby': describedBy,
    ...props
  },
  ref,
) {
  const { inputId, helpId, errorId, ariaDescribedBy } = useFieldMetadata({
    id,
    helpText,
    error,
    describedBy,
  })

  return (
    <FieldLayout
      error={error}
      errorId={errorId}
      helpId={helpId}
      helpText={helpText}
      inputId={inputId}
      label={label}
      required={required}
    >
      <textarea
        {...props}
        aria-describedby={ariaDescribedBy}
        aria-invalid={error ? true : props['aria-invalid']}
        className={[formControlClasses, 'min-h-30 resize-y', className]
          .filter(Boolean)
          .join(' ')}
        id={inputId}
        ref={ref}
        required={required}
      />
    </FieldLayout>
  )
})

export default Textarea
