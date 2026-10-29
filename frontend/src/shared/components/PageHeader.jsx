export default function PageHeader({ actions, description, eyebrow, title, titleId }) {
  return (
    <header className="flex items-end justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-4">
      <div className="grid min-w-0 gap-2">
        {eyebrow ? (
          <p className="text-meta font-bold tracking-[0.06em] text-primary-hover uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-page font-semibold [overflow-wrap:anywhere]" id={titleId}>
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2 max-md:[&>*]:grow">{actions}</div>
      ) : null}
    </header>
  )
}
