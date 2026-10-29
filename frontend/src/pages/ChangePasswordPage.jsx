import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Button from '../shared/components/Button.jsx'
import Card from '../shared/components/Card.jsx'
import ChangePasswordForm from '../features/auth/ChangePasswordForm.jsx'
import { safeReturnPath } from '../features/auth/returnPath.js'
import { useAuth } from '../features/auth/useAuth.js'
import { useToast } from '../shared/feedback/useToast.js'

export default function ChangePasswordPage() {
  const auth = useAuth()
  const { showToast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [rotationInProgress, setRotationInProgress] = useState(false)
  const returnPath = safeReturnPath(location.state?.from)

  if (!auth.user.mustChangePassword && !rotationInProgress) {
    return <Navigate replace to="/security" />
  }

  async function handleSuccess(identity) {
    setRotationInProgress(true)
    await auth.establishSession(identity)
    showToast('Password changed. Your new session is active.')
    navigate(returnPath, { replace: true })
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
    <Card aria-labelledby="change-password-title">
      <div className="mb-6 grid gap-2">
        <p className="text-meta font-bold tracking-[0.06em] text-warning uppercase">
          Required account update
        </p>
        <h1 className="text-page font-semibold" id="change-password-title">
          Change your password
        </h1>
        <p className="text-text-secondary">
          Your account requires a new password before you can use Deskflow.
        </p>
      </div>
      <ChangePasswordForm
        onAccountChanged={handleAccountChanged}
        onSuccess={handleSuccess}
        submitLabel="Set new password"
      />
      <div className="mt-6 border-t border-border pt-4">
        <Button
          className="w-full"
          onClick={handleLogout}
          pending={signingOut}
          pendingLabel="Signing out…"
          variant="ghost"
        >
          Sign out instead
        </Button>
      </div>
    </Card>
  )
}
