import { ShieldCheck } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { env } from '../shared/config/env.js'

export default function AuthLayout() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 max-sm:items-start">
      <div className="grid w-full max-w-md gap-5">
        <header className="flex items-center justify-center gap-3 text-center">
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-card bg-primary text-text-inverse shadow-card"
          >
            <ShieldCheck size={23} />
          </span>
          <div className="text-left">
            <p className="text-xl font-semibold text-text">{env.appName}</p>
            <p className="text-meta text-text-secondary">IT help desk and assets</p>
          </div>
        </header>
        <Outlet />
      </div>
    </main>
  )
}
