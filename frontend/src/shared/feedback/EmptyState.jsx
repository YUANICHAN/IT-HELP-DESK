import { Inbox } from 'lucide-react'

export default function EmptyState({ action, description, icon: Icon = Inbox, title = 'Nothing here yet' }) {
  return (
    <div className="grid min-h-56 content-center justify-items-center gap-4 p-6 text-center">
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-card bg-primary-soft text-primary-hover [&_svg]:size-6"
      >
        <Icon aria-hidden="true" />
      </span>
      <div className="grid max-w-[30rem] gap-2">
        <h3 className="text-section">{title}</h3>
        {description ? <p className="text-text-secondary">{description}</p> : null}
      </div>
      {action ? <div className="flex justify-center">{action}</div> : null}
    </div>
  )
}
