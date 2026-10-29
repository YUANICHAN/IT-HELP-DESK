import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../shared/components/Button.jsx'
import Card, { CardHeader } from '../shared/components/Card.jsx'
import PageHeader from '../shared/components/PageHeader.jsx'
import ChangePasswordForm from '../features/auth/ChangePasswordForm.jsx'
import SessionList from '../features/auth/SessionList.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { useToast } from '../shared/feedback/useToast.js'

export default function SecurityPage() {
  const auth = useAuth()
  const { showToast } = useToast()
  const [signingOut, setSigningOut] = useState(false)

  async function handlePasswordChanged(identity) {
    await auth.establishSession(identity)
    showToast('Password changed. Other sessions were revoked.')
  }

  async function handleAccountChanged() {
    await auth.terminateSession({
      notice: {
        tone: 'danger',
        message: 'Your account changed during the update. Sign in and try again.',
      },
    })
  }

  async function handleLogout() {
    setSigningOut(true)
    await auth.logout()
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl content-start gap-6 px-6 py-8 max-sm:px-4 max-sm:py-5">
      <PageHeader
        actions={
          <>
            <Link
              className="inline-flex min-h-control items-center justify-center rounded-control border border-control-border bg-surface px-4 py-2 font-semibold no-underline hover:border-primary hover:bg-primary-soft"
              to="/"
            >
              Back to Deskflow
            </Link>
            <Button
              onClick={handleLogout}
              pending={signingOut}
              pendingLabel="Signing out…"
              variant="ghost"
            >
              Sign out
            </Button>
          </>
        }
        description={`Signed in as ${auth.user.displayName}. Manage your password and active sessions.`}
        eyebrow="Account security"
        title="Password and sessions"
      />

      <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-start gap-6 max-lg:grid-cols-1">
        <Card aria-labelledby="password-section-title">
          <CardHeader
            description="Changing your password creates a new session and revokes every other active session."
            title="Change password"
            titleId="password-section-title"
          />
          <div className="mt-6">
            <ChangePasswordForm
              onAccountChanged={handleAccountChanged}
              onSuccess={handlePasswordChanged}
            />
          </div>
        </Card>

        <Card aria-labelledby="sessions-section-title">
          <CardHeader
            description="Only active sessions returned by Deskflow are shown."
            title="Active sessions"
            titleId="sessions-section-title"
          />
          <div className="mt-6">
            <SessionList />
          </div>
        </Card>
      </div>
    </main>
  )
}
