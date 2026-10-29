const toneClasses = {
  neutral: 'border-border-strong bg-surface-subtle text-text-secondary',
  info: 'border-primary bg-primary-soft text-primary-hover',
  success: 'border-success bg-success-soft text-success',
  warning: 'border-warning bg-warning-soft text-warning',
  danger: 'border-danger bg-danger-soft text-danger',
}

export default function Badge({ children, className = '', tone = 'neutral' }) {
  return (
    <span
      className={[
        'inline-flex min-h-7 items-center whitespace-nowrap rounded-full border px-3 py-1 text-meta font-semibold leading-tight',
        toneClasses[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}
