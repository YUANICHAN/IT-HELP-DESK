import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Card from '../shared/components/Card.jsx'
import SignInForm from '../features/auth/SignInForm.jsx'
import { safeReturnPath } from '../features/auth/returnPath.js'
import { useAuth } from '../features/auth/useAuth.js'

export default function SignInPage() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const returnPath = safeReturnPath(location.state?.from)

  if (auth.isAuthenticated) {
    return (
      <Navigate
        replace
        state={auth.user.mustChangePassword ? { from: returnPath } : undefined}
        to={auth.user.mustChangePassword ? '/change-password' : returnPath}
      />
    )
  }

  async function handleSuccess(identity) {
    await auth.establishSession(identity)
    if (identity.user.mustChangePassword) {
      navigate('/change-password', { replace: true, state: { from: returnPath } })
    } else {
      navigate(returnPath, { replace: true })
    }
  }

  return (
    <Card aria-labelledby="sign-in-title">
      <div className="mb-6 grid gap-2">
        <p className="text-meta font-bold tracking-[0.06em] text-primary-hover uppercase">
          Secure access
        </p>
        <h1 className="text-page font-semibold" id="sign-in-title">
          Sign in to Deskflow
        </h1>
        <p className="text-text-secondary">
          Use your organization account to continue.
        </p>
      </div>
      {auth.sessionNotice ? (
        <div
          className={[
            'mb-5 rounded-control border p-3 text-sm',
            auth.sessionNotice.tone === 'danger'
              ? 'border-danger bg-danger-soft text-danger'
              : 'border-primary bg-primary-soft text-primary-hover',
          ].join(' ')}
          role={auth.sessionNotice.tone === 'danger' ? 'alert' : 'status'}
        >
          {auth.sessionNotice.message}
        </div>
      ) : null}
      <SignInForm onSuccess={handleSuccess} />
      <p className="mt-6 border-t border-border pt-4 text-meta text-text-secondary">
        Password reset and account activation are not available in Deskflow yet. Contact
        your administrator for account help.
      </p>
    </Card>
  )
}
