import { useId } from 'react'

export function useFieldMetadata({ id, helpText, error, describedBy }) {
  const generatedId = useId()
  const inputId = id || `field-${generatedId}`
  const helpId = helpText ? `${inputId}-help` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const ariaDescribedBy = [describedBy, helpId, errorId].filter(Boolean).join(' ') || undefined

  return { inputId, helpId, errorId, ariaDescribedBy }
}
