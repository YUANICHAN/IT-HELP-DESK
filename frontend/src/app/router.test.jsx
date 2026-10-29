import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from './router.jsx'
import { createAppQueryClient } from './queryClient.js'
import { renderWithProviders } from '../test/renderWithProviders.jsx'
import { authFixture, sessionsFixture } from '../test/fixtures/auth.js'
import { server } from '../test/server.js'
import { getCsrfToken } from '../shared/api/authIntegration.js'
import { ticketKeys } from '../shared/api/queryKeys.js'

describe('application routes', () => {
  it('restores a valid session before rendering protected content', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ data: authFixture() }),
      ),
    )
    renderWithProviders(<AppRoutes />)

    expect(screen.getByLabelText('Loading your Deskflow session')).toBeInTheDocument()
    expect(screen.queryByText(/welcome, synthetic requester/i)).not.toBeInTheDocument()
    expect(
      await screen.findByText(/welcome, synthetic requester/i),
    ).toBeInTheDocument()
  })

  it('redirects an unauthenticated protected route to sign in', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json(
          { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Required' } },
          { status: 401 },
        ),
      ),
    )
    renderWithProviders(<AppRoutes />, { route: '/security' })

    expect(
      await screen.findByRole('heading', { name: 'Sign in to Deskflow' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Password and sessions')).not.toBeInTheDocument()
  })

  it('returns to a safe intended page after sign in', async () => {
    const identity = authFixture()
    let signedIn = false
    server.use(
      http.get('*/api/v1/auth/me', () =>
        signedIn
          ? HttpResponse.json({ data: identity })
          : HttpResponse.json(
              { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Required' } },
              { status: 401 },
            ),
      ),
      http.post('*/api/v1/auth/login', () => {
        signedIn = true
        return HttpResponse.json({ data: identity })
      }),
      http.get('*/api/v1/auth/sessions', () =>
        HttpResponse.json({ data: sessionsFixture() }),
      ),
    )
    const { user } = renderWithProviders(<AppRoutes />, { route: '/security' })
    await screen.findByRole('heading', { name: 'Sign in to Deskflow' })
    await user.type(screen.getByLabelText(/^Email address/i), 'requester@example.test')
    await user.type(screen.getByLabelText(/^Password/i), 'Synthetic-Password-1!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { name: 'Password and sessions' }),
    ).toBeInTheDocument()
  })

  it('restricts a forced-change identity to the password page', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({
          data: authFixture({ user: { mustChangePassword: true } }),
        }),
      ),
    )
    renderWithProviders(<AppRoutes />)

    expect(
      await screen.findByRole('heading', { name: 'Change your password' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/welcome, synthetic requester/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out instead' })).toBeInTheDocument()
  })

  it('rotates a forced-change session, clears private data, and resumes navigation', async () => {
    const forcedIdentity = authFixture({
      user: { mustChangePassword: true },
      csrfToken: 'forced-session-csrf',
    })
    const rotatedIdentity = authFixture({
      user: { mustChangePassword: false },
      session: { id: '507f1f77bcf86cd799439088' },
      csrfToken: 'rotated-session-csrf',
    })
    const queryClient = createAppQueryClient()
    let changed = false
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ data: changed ? rotatedIdentity : forcedIdentity }),
      ),
      http.post('*/api/v1/auth/change-password', async ({ request }) => {
        expect(request.headers.get('X-CSRF-Token')).toBe('forced-session-csrf')
        expect(await request.json()).toEqual({
          currentPassword: 'Current-Password-1!',
          newPassword: 'Updated-Password-2!',
        })
        changed = true
        return HttpResponse.json({ data: rotatedIdentity })
      }),
    )
    const { user } = renderWithProviders(<AppRoutes />, { queryClient })
    await screen.findByRole('heading', { name: 'Change your password' })
    queryClient.setQueryData(ticketKeys.detail('old-private-ticket'), {
      title: 'Old private ticket',
    })
    await user.type(screen.getByLabelText(/^Current password/i), 'Current-Password-1!')
    await user.type(screen.getByLabelText(/^New password/i), 'Updated-Password-2!')
    await user.type(
      screen.getByLabelText(/^Confirm new password/i),
      'Updated-Password-2!',
    )
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText(/welcome, synthetic requester/i)).toBeInTheDocument()
    expect(getCsrfToken()).toBe('rotated-session-csrf')
    expect(queryClient.getQueryData(ticketKeys.detail('old-private-ticket'))).toBeUndefined()
    expect(screen.queryByRole('heading', { name: 'Change your password' })).not.toBeInTheDocument()
  })

  it('renders the not-found fallback after authentication bootstrap', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json(
          { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Required' } },
          { status: 401 },
        ),
      ),
    )
    renderWithProviders(<AppRoutes />, { route: '/not-a-real-route' })

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})
