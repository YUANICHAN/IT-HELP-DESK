import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Laptop, Monitor, Smartphone, Tablet } from 'lucide-react'
import Badge from '../../shared/components/Badge.jsx'
import Button from '../../shared/components/Button.jsx'
import ConfirmDialog from '../../shared/components/ConfirmDialog.jsx'
import Skeleton from '../../shared/components/Skeleton.jsx'
import EmptyState from '../../shared/feedback/EmptyState.jsx'
import ErrorState from '../../shared/feedback/ErrorState.jsx'
import FormError from '../../shared/feedback/FormError.jsx'
import { authKeys } from '../../shared/api/queryKeys.js'
import { useToast } from '../../shared/feedback/useToast.js'
import { revokeSessionMutationOptions } from './mutations.js'
import { sessionsQueryOptions } from './queries.js'
import { useAuth } from './useAuth.js'

const deviceIcons = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: Laptop,
}

function formatInstant(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function SessionLoading() {
  return (
    <div aria-label="Loading active sessions" className="grid gap-3" role="status">
      {[0, 1].map((item) => (
        <div className="grid gap-3 rounded-card border border-border p-4" key={item}>
          <Skeleton height="1.25rem" width="55%" />
          <Skeleton height="1rem" width="75%" />
          <Skeleton height="2.75rem" width="8rem" />
        </div>
      ))}
      <span className="sr-only">Loading active sessions</span>
    </div>
  )
}

export default function SessionList() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [selectedSession, setSelectedSession] = useState(null)
  const sessionsQuery = useQuery(sessionsQueryOptions())
  const mutation = useMutation(
    revokeSessionMutationOptions({
      onError: async (error) => {
        if (error?.status === 404) {
          await queryClient.invalidateQueries({ queryKey: authKeys.sessions() })
        }
      },
      onSuccess: async (_data, variables) => {
        const revokedCurrent = variables.isCurrent
        setSelectedSession(null)
        if (revokedCurrent) {
          await auth.terminateSession({
            notice: { tone: 'info', message: 'Your current session was revoked.' },
          })
          return
        }
        await queryClient.invalidateQueries({ queryKey: authKeys.sessions() })
        showToast('Session revoked.')
      },
    }),
  )

  function requestRevocation(session) {
    mutation.reset()
    setSelectedSession(session)
  }

  function confirmRevocation() {
    mutation.mutate({
      sessionId: selectedSession.id,
      isCurrent: selectedSession.isCurrent,
    })
  }

  if (sessionsQuery.isPending) return <SessionLoading />
  if (sessionsQuery.isError) {
    return (
      <ErrorState
        description="Your active sessions could not be loaded."
        onRetry={() => sessionsQuery.refetch()}
        requestId={sessionsQuery.error.requestId}
        title="Sessions unavailable"
      />
    )
  }

  const sessions = sessionsQuery.data.sessions
  if (sessions.length === 0) {
    return (
      <EmptyState
        description="No active sessions were returned for this account."
        title="No active sessions"
      />
    )
  }

  return (
    <>
      <FormError
        id="session-revocation-error"
        message={
          mutation.error
            ? mutation.error.status === 404
              ? 'That session is no longer active. The list has been refreshed.'
              : mutation.error.message
            : null
        }
      />
      <ul aria-describedby={mutation.error ? 'session-revocation-error' : undefined} className="grid gap-3">
        {sessions.map((session) => {
          const DeviceIcon = deviceIcons[session.client.deviceType] || Laptop
          return (
            <li
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4 rounded-card border border-border p-4 max-sm:grid-cols-[auto_minmax(0,1fr)]"
              key={session.id}
            >
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-control bg-primary-soft text-primary"
              >
                <DeviceIcon size={20} />
              </span>
              <div className="grid min-w-0 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">
                    {session.client.browser} on {session.client.operatingSystem}
                  </h3>
                  {session.isCurrent ? <Badge tone="info">Current session</Badge> : null}
                </div>
                <dl className="grid gap-1 text-meta text-text-secondary">
                  <div className="flex flex-wrap gap-1">
                    <dt className="font-semibold text-text">Last active:</dt>
                    <dd>
                      <time dateTime={session.lastSeenAt}>{formatInstant(session.lastSeenAt)}</time>
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <dt className="font-semibold text-text">Session expires:</dt>
                    <dd>
                      <time dateTime={session.absoluteExpiresAt}>
                        {formatInstant(session.absoluteExpiresAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
              </div>
              <Button
                className="max-sm:col-span-2 max-sm:w-full"
                onClick={() => requestRevocation(session)}
                variant={session.isCurrent ? 'destructive' : 'secondary'}
              >
                {session.isCurrent ? 'Revoke and sign out' : 'Revoke session'}
              </Button>
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        confirmLabel={selectedSession?.isCurrent ? 'Revoke and sign out' : 'Revoke session'}
        description={
          selectedSession?.isCurrent
            ? 'This ends the session you are using and returns you to sign in.'
            : 'This ends the selected active session. It cannot be undone.'
        }
        onCancel={() => setSelectedSession(null)}
        onConfirm={confirmRevocation}
        open={Boolean(selectedSession)}
        pending={mutation.isPending}
        pendingLabel="Revoking…"
        title="Revoke this session?"
        variant="destructive"
      />
    </>
  )
}
