import { Blocks, CheckCircle2, Route, ShieldCheck, SwatchBook } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../shared/components/Card.jsx'
import Button from '../shared/components/Button.jsx'
import { env } from '../shared/config/env.js'
import { useAuth } from '../features/auth/useAuth.js'
import { useState } from 'react'

const foundationItems = [
  {
    icon: Blocks,
    title: 'Providers ready',
    description: 'Shared query and toast provider boundaries are configured.',
  },
  {
    icon: Route,
    title: 'Routing ready',
    description: 'Only public foundation and development preview routes are active.',
  },
  {
    icon: ShieldCheck,
    title: 'Session protected',
    description: 'Your identity and CSRF state are held only for this browser session.',
  },
]

export default function FoundationPage() {
  const auth = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function handleLogout() {
    setSigningOut(true)
    await auth.logout()
  }

  return (
    <main className="grid min-h-screen place-items-center px-6 py-8 max-md:items-start max-md:p-4">
      <Card aria-labelledby="foundation-title" className="w-full max-w-[55rem]">
        <div
          aria-hidden="true"
          className="mb-6 grid size-12 place-items-center rounded-card bg-primary-soft text-primary"
        >
          <CheckCircle2 size={24} strokeWidth={2} />
        </div>
        <p className="mb-2 text-meta font-bold tracking-[0.08em] text-primary-hover uppercase">
          Authenticated foundation
        </p>
        <h1 className="text-page" id="foundation-title">
          {env.appName}
        </h1>
        <p className="mt-3 max-w-2xl text-text-secondary">
          Welcome, {auth.user.displayName}. Authentication and account security are active;
          the connected dashboard arrives in Step 7.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-4 max-md:grid-cols-1">
          {foundationItems.map(({ icon: Icon, title, description }) => (
            <article
              className="flex min-w-0 gap-3 rounded-card border border-border p-4"
              key={title}
            >
              <Icon
                aria-hidden="true"
                className="shrink-0 text-primary"
                size={20}
                strokeWidth={1.8}
              />
              <div>
                <h2 className="text-base">{title}</h2>
                <p className="mt-2 text-[0.9375rem] text-text-secondary">{description}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <Link
            className="inline-flex min-h-control items-center justify-center rounded-control border border-primary bg-primary px-4 py-2 font-semibold text-text-inverse no-underline hover:bg-primary-hover hover:text-text-inverse"
            to="/security"
          >
            Account security
          </Link>
          <Button
            onClick={handleLogout}
            pending={signingOut}
            pendingLabel="Signing out…"
            variant="ghost"
          >
            Sign out
          </Button>
        </div>

        {import.meta.env.DEV ? (
          <Link
            className="mt-6 inline-flex min-h-control items-center justify-center gap-2 rounded-control border border-primary bg-primary px-4 py-2 font-semibold text-text-inverse no-underline hover:bg-primary-hover hover:text-text-inverse"
            to="/dev/components"
          >
            <SwatchBook aria-hidden="true" size={18} />
            Open component gallery
          </Link>
        ) : null}
      </Card>
    </main>
  )
}
