import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import IconButton from './IconButton.jsx'

const sizeClasses = {
  small: 'max-w-md',
  medium: 'max-w-xl',
  large: 'max-w-3xl',
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function Dialog({
  children,
  description,
  footer,
  initialFocusRef,
  isDismissable = true,
  onClose,
  open,
  size = 'medium',
  title,
}) {
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return undefined

    previousFocusRef.current = document.activeElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const dialog = dialogRef.current
    const preferredFocus = initialFocusRef?.current
    const firstFocusable = dialog?.querySelector(focusableSelector)
    ;(preferredFocus || firstFocusable || dialog)?.focus()

    return () => {
      document.body.style.overflow = originalOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [initialFocusRef, open])

  if (!open) return null

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (isDismissable) onClose()
      return
    }

    if (event.key !== 'Tab') return

    const focusableElements = [...dialogRef.current.querySelectorAll(focusableSelector)]
    if (focusableElements.length === 0) {
      event.preventDefault()
      dialogRef.current.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget && isDismissable) onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] grid items-center justify-items-center overflow-y-auto bg-overlay p-6 max-sm:items-end max-sm:p-3"
      onMouseDown={handleBackdropClick}
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={[
          'max-h-[calc(100vh-3rem)] w-full overflow-y-auto rounded-dialog border border-border bg-surface shadow-dialog max-sm:max-h-[calc(100vh-1.5rem)]',
          sizeClasses[size],
        ].join(' ')}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex="-1"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 max-sm:p-4 max-sm:pb-4">
          <div className="grid gap-2">
            <h2 className="text-xl font-semibold" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="text-text-secondary" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          {isDismissable ? (
            <IconButton label="Close dialog" onClick={onClose} variant="ghost">
              <X aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
        <div className="px-6 pb-6 max-sm:px-4 max-sm:pb-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4 max-sm:flex-col-reverse max-sm:items-stretch max-sm:px-4 max-sm:[&>*]:w-full">
            {footer}
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}
