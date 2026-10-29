import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../shared/components/Card.jsx'

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-lg">
        <p className="mb-2 text-meta font-bold tracking-[0.08em] text-primary-hover">404</p>
        <h1>Page not found</h1>
        <p className="mt-3 text-text-secondary">
          The requested Deskflow page does not exist.
        </p>
        <Link className="mt-6 inline-flex min-h-control items-center gap-2 font-semibold" to="/">
          <ArrowLeft aria-hidden="true" size={18} />
          Return to foundation
        </Link>
      </Card>
    </main>
  )
}
