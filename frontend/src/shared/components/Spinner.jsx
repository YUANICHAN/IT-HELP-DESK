const sizeClasses = {
  small: 'size-4',
  medium: 'size-5',
  large: 'size-8',
}

export default function Spinner({ label = 'Loading', size = 'medium', className = '' }) {
  const classes = [
    'inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:[animation-duration:1.8s]',
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (!label) {
    return <span aria-hidden="true" className={classes} />
  }

  return (
    <span className="inline-flex" role="status">
      <span aria-hidden="true" className={classes} />
      <span className="sr-only">{label}</span>
    </span>
  )
}
