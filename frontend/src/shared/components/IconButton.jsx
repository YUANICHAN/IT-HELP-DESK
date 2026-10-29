import { forwardRef } from 'react'
import Button from './Button.jsx'

const IconButton = forwardRef(function IconButton(
  { label, children, className = '', variant = 'ghost', ...props },
  ref,
) {
  if (!label) {
    throw new Error('IconButton requires a visible-to-assistive-technology label.')
  }

  return (
    <Button
      {...props}
      aria-label={label}
      className={[
        'size-control min-h-control min-w-control p-0 [&>span]:contents [&_svg]:size-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      ref={ref}
      title={label}
      variant={variant}
    >
      {children}
    </Button>
  )
})

export default IconButton
