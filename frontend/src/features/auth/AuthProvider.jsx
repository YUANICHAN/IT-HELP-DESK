import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Skeleton from '../../shared/components/Skeleton.jsx'
import ErrorState from '../../shared/feedback/ErrorState.jsx'
import {
  clearCsrfToken,
  replaceCsrfToken,
  subscribeToSessionExpiry,
} from '../../shared/api/authIntegration.js'
import { clearPrivateClientState } from '../../shared/api/cacheLifecycle.js'
import { authKeys } from '../../shared/api/queryKeys.js'
import { logout as logoutRequest } from './api.js'
import { currentIdentityQueryOptions } from './queries.js'
import { AuthContext } from './AuthContext.js'

const EXPIRED_NOTICE = Object.freeze({
  tone: 'info',
  message: 'Your session ended. Sign in again to continue.',
})

function BootScreen() {
  return (
    <main
      aria-label="Loading your Deskflow session"
      aria-live="polite"
      className="grid min-h-screen place-items-center p-6"
      role="status"
    >
      <div className="grid w-full max-w-md gap-5 rounded-card border border-border bg-surface p-6 shadow-card">
        <Skeleton height="2.5rem" width="8rem" />
        <div className="grid gap-3">
          <Skeleton height="1.5rem" width="70%" />
          <Skeleton height="1rem" />
          <Skeleton height="1rem" width="85%" />
        </div>
        <Skeleton height="2.75rem" />
        <span className="sr-only">Checking your session</span>
      </div>
    </main>
  )
}

function BootstrapError({ error, onRetry }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-xl rounded-card border border-border bg-surface shadow-card">
        <ErrorState
          description="Deskflow could not verify your session. This does not mean you have been signed out."
          onRetry={onRetry}
          requestId={error?.requestId}
          title="Authentication service unavailable"
        />
      </div>
    </main>
  )
}

export default function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [bootstrapEnabled, setBootstrapEnabled] = useState(true)
  const [sessionInvalidated, setSessionInvalidated] = useState(false)
  const [sessionNotice, setSessionNotice] = useState(null)
  const [activeIdentityId, setActiveIdentityId] = useState(null)
  const transitionRef = useRef(0)
  const identityQuery = useQuery({
    ...currentIdentityQueryOptions(),
    enabled: bootstrapEnabled,
  })

  const terminateSession = useCallback(
    async ({ notice = null } = {}) => {
      const transition = transitionRef.current + 1
      transitionRef.current = transition
      setSessionInvalidated(true)
      setBootstrapEnabled(false)
      setSessionNotice(notice)
      setActiveIdentityId(null)
      await clearPrivateClientState(queryClient)
      return transition === transitionRef.current
    },
    [queryClient],
  )

  const establishSession = useCallback(
    async (identity) => {
      const transition = transitionRef.current + 1
      transitionRef.current = transition
      setSessionInvalidated(true)
      setBootstrapEnabled(false)
      await clearPrivateClientState(queryClient)
      if (transition !== transitionRef.current) return false

      replaceCsrfToken(identity.csrfToken)
      queryClient.setQueryData(authKeys.me(), identity)
      setActiveIdentityId(identity.user.id)
      setSessionNotice(null)
      setSessionInvalidated(false)
      setBootstrapEnabled(true)
      return true
    },
    [queryClient],
  )

  const logout = useCallback(async () => {
    let error = null
    try {
      await logoutRequest()
    } catch (requestError) {
      error = requestError
    }

    const serverSessionAlreadyAbsent = error?.status === 401
    const notice =
      error && !serverSessionAlreadyAbsent
        ? {
            tone: 'danger',
            message:
              'You were signed out locally, but Deskflow could not confirm server logout. Close this browser if it is shared.',
          }
        : null
    await terminateSession({ notice })
    return { confirmed: !error || serverSessionAlreadyAbsent, error }
  }, [terminateSession])

  const retryBootstrap = useCallback(async () => {
    setSessionInvalidated(false)
    setBootstrapEnabled(true)
    await identityQuery.refetch()
  }, [identityQuery])

  const identity = identityQuery.data || null
  const identityChanged = Boolean(
    identity && activeIdentityId && identity.user.id !== activeIdentityId,
  )
  const unauthenticatedError = identityQuery.error?.status === 401

  useLayoutEffect(() => {
    if (!identity || sessionInvalidated) return
    if (identityChanged) {
      const timeout = window.setTimeout(() => void establishSession(identity), 0)
      return () => window.clearTimeout(timeout)
    }
    replaceCsrfToken(identity.csrfToken)
    if (!activeIdentityId) {
      const timeout = window.setTimeout(() => setActiveIdentityId(identity.user.id), 0)
      return () => window.clearTimeout(timeout)
    }
    return undefined
  }, [
    activeIdentityId,
    establishSession,
    identity,
    identityChanged,
    sessionInvalidated,
  ])

  useEffect(() => {
    if (!unauthenticatedError || sessionInvalidated || !bootstrapEnabled) {
      return undefined
    }
    const notice = activeIdentityId ? EXPIRED_NOTICE : null
    const timeout = window.setTimeout(() => void terminateSession({ notice }), 0)
    return () => window.clearTimeout(timeout)
  }, [
    bootstrapEnabled,
    activeIdentityId,
    sessionInvalidated,
    terminateSession,
    unauthenticatedError,
  ])

  useEffect(
    () =>
      subscribeToSessionExpiry(() => {
        void terminateSession({ notice: EXPIRED_NOTICE })
      }),
    [terminateSession],
  )

  useEffect(() => () => clearCsrfToken(), [])

  let status
  if (sessionInvalidated || !bootstrapEnabled || unauthenticatedError) {
    status = 'signedOut'
  } else if (identityChanged || (!identity && identityQuery.isFetching)) {
    status = 'booting'
  } else if (identity) {
    status = 'authenticated'
  } else if (identityQuery.error) {
    status = 'failure'
  } else {
    status = 'booting'
  }

  const clearSessionNotice = useCallback(() => setSessionNotice(null), [])
  const value = useMemo(
    () => ({
      status,
      identity: status === 'authenticated' ? identity : null,
      user: status === 'authenticated' ? identity.user : null,
      isAuthenticated: status === 'authenticated',
      identityRefreshError:
        status === 'authenticated' ? identityQuery.error || null : null,
      sessionNotice,
      clearSessionNotice,
      establishSession,
      terminateSession,
      logout,
    }),
    [
      clearSessionNotice,
      establishSession,
      identity,
      identityQuery.error,
      logout,
      sessionNotice,
      status,
      terminateSession,
    ],
  )

  if (status === 'booting') return <BootScreen />
  if (status === 'failure') {
    return <BootstrapError error={identityQuery.error} onRetry={retryBootstrap} />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
