import { forwardRef } from 'react'
import Spinner from './Spinner.jsx'

const variantClasses = {
  primary:
    'border-primary bg-primary text-text-inverse enabled:hover:border-primary-hover enabled:hover:bg-primary-hover',
  secondary:
    'border-control-border bg-surface text-text enabled:hover:border-primary enabled:hover:bg-primary-soft enabled:hover:text-primary-hover',
  ghost:
    'border-transparent bg-transparent text-primary-hover enabled:hover:bg-primary-soft',
  destructive:
    'border-danger bg-danger text-text-inverse enabled:hover:border-danger-hover enabled:hover:bg-danger-hover',
}

const Button = forwardRef(function Button(
  {
    children,
    className = '',
    disabled = false,
    pending = false,
    pendingLabel = 'Working…',
    startIcon,
    endIcon,
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  const classes = [
    'inline-flex min-h-control min-w-0 cursor-pointer items-center justify-center gap-2 rounded-control border px-4 py-2 text-center font-semibold leading-tight transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-[0.58] [&>svg]:size-[1.125rem] [&>svg]:shrink-0',
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      {...props}
      aria-busy={pending || undefined}
      className={classes}
      disabled={disabled || pending}
      ref={ref}
      type={type}
    >
      {pending ? <Spinner label={null} size="small" /> : startIcon}
      <span>{pending ? pendingLabel : children}</span>
      {!pending && endIcon}
    </button>
  )
})

export default Button
