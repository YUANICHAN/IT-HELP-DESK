import { forwardRef } from 'react'
import { FieldLayout } from './FieldLayout.jsx'
import { useFieldMetadata } from './useFieldMetadata.js'
import { formControlClasses } from './formControlClasses.js'

const Select = forwardRef(function Select(
  {
    children,
    className = '',
    error,
    helpText,
    id,
    label,
    options,
    placeholder,
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
      <select
        {...props}
        aria-describedby={ariaDescribedBy}
        aria-invalid={error ? true : props['aria-invalid']}
        className={[formControlClasses, 'cursor-pointer disabled:cursor-not-allowed', className]
          .filter(Boolean)
          .join(' ')}
        id={inputId}
        ref={ref}
        required={required}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options
          ? options.map((option) => (
              <option disabled={option.disabled} key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          : children}
      </select>
    </FieldLayout>
  )
})

export default Select
