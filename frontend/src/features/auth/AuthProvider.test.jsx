import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { createAppQueryClient } from '../../app/queryClient.js'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import { server } from '../../test/server.js'
import { authFixture } from '../../test/fixtures/auth.js'
import {
  getCsrfToken,
  notifySessionExpired,
} from '../../shared/api/authIntegration.js'
import { ApiError } from '../../shared/api/apiError.js'
import { ticketKeys } from '../../shared/api/queryKeys.js'
import { useAuth } from './useAuth.js'

function AuthProbe({ nextIdentity }) {
  const auth = useAuth()
  return (
    <div>
      <p>{auth.status}</p>
      <p>{auth.user?.displayName || 'No identity'}</p>
      <p>{auth.sessionNotice?.message}</p>
      <button onClick={() => auth.establishSession(nextIdentity)} type="button">
        Replace session
      </button>
      <button onClick={() => auth.logout()} type="button">
        Sign out
      </button>
    </div>
  )
}

describe('AuthProvider lifecycle', () => {
  it('bootstraps identity and replaces in-memory CSRF', async () => {
    const identity = authFixture()
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ data: identity })),
    )

    renderWithProviders(<AuthProbe nextIdentity={identity} />, { withAuth: true })

    expect(screen.getByLabelText('Loading your Deskflow session')).toBeInTheDocument()
    expect(screen.queryByText('Synthetic Requester')).not.toBeInTheDocument()
    expect(await screen.findByText('Synthetic Requester')).toBeInTheDocument()
    expect(getCsrfToken()).toBe('synthetic-csrf-token')
  })

  it('keeps a temporary bootstrap failure distinct from signed out and recovers', async () => {
    const identity = authFixture()
    let attempts = 0
    server.use(
      http.get('*/api/v1/auth/me', () => {
        attempts += 1
        return attempts <= 2
          ? HttpResponse.json(
              { error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' } },
              { status: 503 },
            )
          : HttpResponse.json({ data: identity })
      }),
    )

    const { user } = renderWithProviders(<AuthProbe nextIdentity={identity} />, {
      withAuth: true,
    })

    expect(
      await screen.findByRole('heading', { name: 'Authentication service unavailable' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('No identity')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Synthetic Requester')).toBeInTheDocument()
  })

  it('clears private data immediately on protected-session expiry', async () => {
    const identity = authFixture()
    const queryClient = createAppQueryClient()
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ data: identity })),
    )
    renderWithProviders(<AuthProbe nextIdentity={identity} />, {
      queryClient,
      withAuth: true,
    })
    await screen.findByText('Synthetic Requester')
    queryClient.setQueryData(ticketKeys.detail('private-ticket'), { title: 'Private' })

    act(() => {
      notifySessionExpired(
        new ApiError({ status: 401, code: 'AUTHENTICATION_REQUIRED' }),
      )
    })

    expect(await screen.findByText('No identity')).toBeInTheDocument()
    expect(screen.getByText('signedOut')).toBeInTheDocument()
    expect(queryClient.getQueryData(ticketKeys.detail('private-ticket'))).toBeUndefined()
    expect(getCsrfToken()).toBeNull()
  })

  it('isolates a replacement identity from private and delayed prior-session data', async () => {
    const firstIdentity = authFixture()
    const secondIdentity = authFixture({
      user: {
        id: '507f1f77bcf86cd799439099',
        displayName: 'Second Synthetic User',
      },
      csrfToken: 'rotated-csrf-token',
    })
    const queryClient = createAppQueryClient()
    let resolveDelayed
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ data: firstIdentity })),
    )
    const { user } = renderWithProviders(
      <AuthProbe nextIdentity={secondIdentity} />,
      { queryClient, withAuth: true },
    )
    await screen.findByText('Synthetic Requester')
    queryClient.setQueryData(ticketKeys.detail('old-ticket'), { title: 'Old private row' })
    const delayed = queryClient
      .fetchQuery({
        queryKey: ticketKeys.detail('delayed-ticket'),
        queryFn: () =>
          new Promise((resolve) => {
            resolveDelayed = resolve
          }),
      })
      .catch(() => undefined)

    await user.click(screen.getByRole('button', { name: 'Replace session' }))
    expect(await screen.findByText('Second Synthetic User')).toBeInTheDocument()
    resolveDelayed({ title: 'Late prior identity data' })
    await delayed

    expect(queryClient.getQueryData(ticketKeys.detail('old-ticket'))).toBeUndefined()
    expect(queryClient.getQueryData(ticketKeys.detail('delayed-ticket'))).toBeUndefined()
    expect(getCsrfToken()).toBe('rotated-csrf-token')
  })

  it('clears locally and reports when server logout cannot be confirmed', async () => {
    const identity = authFixture()
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ data: identity })),
      http.post('*/api/v1/auth/logout', ({ request }) => {
        expect(request.headers.get('X-CSRF-Token')).toBe('synthetic-csrf-token')
        return HttpResponse.json(
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' } },
          { status: 503 },
        )
      }),
    )
    const { user } = renderWithProviders(<AuthProbe nextIdentity={identity} />, {
      withAuth: true,
    })
    await screen.findByText('Synthetic Requester')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('No identity')).toBeInTheDocument()
    await waitFor(() => expect(getCsrfToken()).toBeNull())
    expect(screen.getByText(/could not confirm server logout/i)).toBeInTheDocument()
  })
})
