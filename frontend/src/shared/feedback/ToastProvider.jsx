import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Info, X } from 'lucide-react'
import IconButton from '../components/IconButton.jsx'
import { ToastContext } from './ToastContext.js'

const toneClasses = {
  success: '[&_.toast-icon]:text-success',
  info: '[&_.toast-icon]:text-primary',
}

function Toast({ duration, id, message, onDismiss, tone }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(id), duration)
    return () => window.clearTimeout(timeout)
  }, [duration, id, onDismiss])

  const Icon = tone === 'success' ? CheckCircle2 : Info

  return (
    <div
      className={[
        'pointer-events-auto grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-border-strong bg-surface p-3 text-text shadow-dialog',
        toneClasses[tone],
      ].join(' ')}
      role="status"
    >
      <Icon aria-hidden="true" className="toast-icon size-5" />
      <p>{message}</p>
      <IconButton label="Dismiss notification" onClick={() => onDismiss(id)} variant="ghost">
        <X aria-hidden="true" />
      </IconButton>
    </div>
  )
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message, options = {}) => {
    const toast = {
      id: nextId.current,
      message,
      tone: options.tone || 'success',
      duration: options.duration || 3500,
    }
    nextId.current += 1
    setToasts((current) => [...current.slice(-2), toast])
    return toast.id
  }, [])

  const value = useMemo(
    () => ({ dismissToast, showToast }),
    [dismissToast, showToast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 bottom-4 z-[1100] grid w-[min(calc(100%_-_2rem),24rem)] gap-2"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} onDismiss={dismissToast} {...toast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
