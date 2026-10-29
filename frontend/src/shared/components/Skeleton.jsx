export default function Skeleton({ className = '', height, width }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'block max-w-full animate-pulse rounded-control bg-border motion-reduce:animate-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ height: height || '1rem', width: width || '100%' }}
    />
  )
}
