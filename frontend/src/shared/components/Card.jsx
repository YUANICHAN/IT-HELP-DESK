const paddingClasses = {
  standard: 'p-6 max-sm:p-4',
  compact: 'p-4',
  none: 'p-0',
}

export default function Card({ as: Component = 'section', children, className = '', padding = 'standard', ...props }) {
  return (
    <Component
      {...props}
      className={[
        'min-w-0 rounded-card border border-border bg-surface shadow-card',
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Component>
  )
}

export function CardHeader({ action, children, description, title }) {
  return (
    <div className="flex items-start justify-between gap-4 max-sm:flex-col">
      <div className="grid min-w-0 gap-1">
        {title ? <h2 className="text-section font-semibold">{title}</h2> : null}
        {description ? (
          <p className="text-[0.9375rem] text-text-secondary">{description}</p>
        ) : null}
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
