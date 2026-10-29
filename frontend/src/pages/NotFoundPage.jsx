import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="feedback-page">
      <section className="feedback-card">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>The requested Deskflow page does not exist.</p>
        <Link className="primary-action" to="/">
          <ArrowLeft aria-hidden="true" size={18} />
          Return to foundation
        </Link>
      </section>
    </main>
  )
}
