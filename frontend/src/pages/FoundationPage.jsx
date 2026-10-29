import { Blocks, CheckCircle2, Route, ShieldCheck } from 'lucide-react'
import { env } from '../shared/config/env.js'

const foundationItems = [
  {
    icon: Blocks,
    title: 'Providers ready',
    description: 'A shared query client and application provider boundary are configured.',
  },
  {
    icon: Route,
    title: 'Routing ready',
    description: 'Only this public foundation route and the not-found fallback are active.',
  },
  {
    icon: ShieldCheck,
    title: 'Security work reserved',
    description: 'Session bootstrap and permission guards remain intentionally deferred.',
  },
]

export default function FoundationPage() {
  return (
    <main className="foundation-page">
      <section className="foundation-card" aria-labelledby="foundation-title">
        <div className="brand-mark" aria-hidden="true">
          <CheckCircle2 size={24} strokeWidth={2} />
        </div>
        <p className="eyebrow">Project foundation</p>
        <h1 id="foundation-title">{env.appName}</h1>
        <p className="foundation-intro">
          The frontend foundation is ready for the blue design system and later
          feature work.
        </p>

        <div className="foundation-grid">
          {foundationItems.map(({ icon: Icon, title, description }) => (
            <article className="foundation-item" key={title}>
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              <div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="foundation-note">
          This is a non-sensitive public placeholder. It does not perform
          authentication or grant access to help-desk data.
        </p>
      </section>
    </main>
  )
}
