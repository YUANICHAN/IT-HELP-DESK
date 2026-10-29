import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/router.jsx'
import { authFixture, sessionsFixture } from '../../test/fixtures/auth.js'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import { server } from '../../test/server.js'

describe('SessionList', () => {
  it('lists only returned metadata and revokes another active session', async () => {
    const identity = authFixture()
    let revoked = false
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ data: identity })),
      http.get('*/api/v1/auth/sessions', () =>
        HttpResponse.json({
          data: revoked
            ? { sessions: [sessionsFixture().sessions[0]] }
            : sessionsFixture(),
        }),
      ),
      http.delete('*/api/v1/auth/sessions/:sessionId', ({ params, request }) => {
        expect(params.sessionId).toBe('507f1f77bcf86cd799439015')
        expect(request.headers.get('X-CSRF-Token')).toBe('synthetic-csrf-token')
        revoked = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderWithProviders(<AppRoutes />, { route: '/security' })

    expect(await screen.findByText('Google Chrome on Windows')).toBeInTheDocument()
    expect(screen.getByText('Safari on iOS')).toBeInTheDocument()
    expect(screen.getByText('Current session')).toBeInTheDocument()
    expect(screen.queryByText(/location|ip address/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Revoke session' }))
    const dialog = screen.getByRole('dialog', { name: 'Revoke this session?' })
    expect(dialog).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Revoke session' }))

    expect(await screen.findByText('Session revoked.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Safari on iOS')).not.toBeInTheDocument())
  })

  it('signs out after revoking the current session', async () => {
    const identity = authFixture()
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ data: identity })),
      http.get('*/api/v1/auth/sessions', () =>
        HttpResponse.json({ data: { sessions: [sessionsFixture().sessions[0]] } }),
      ),
      http.delete('*/api/v1/auth/sessions/:sessionId', () =>
        new HttpResponse(null, { status: 204 }),
      ),
    )
    const { user } = renderWithProviders(<AppRoutes />, { route: '/security' })
    await screen.findByText('Google Chrome on Windows')

    await user.click(screen.getByRole('button', { name: 'Revoke and sign out' }))
    const dialog = screen.getByRole('dialog', { name: 'Revoke this session?' })
    await user.click(within(dialog).getByRole('button', { name: 'Revoke and sign out' }))

    expect(
      await screen.findByRole('heading', { name: 'Sign in to Deskflow' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Your current session was revoked.')).toBeInTheDocument()
  })
})
