import { screen, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import { authFixture } from '../../test/fixtures/auth.js'
import { server } from '../../test/server.js'
import SignInForm from './SignInForm.jsx'

async function fillCredentials(user) {
  await user.type(screen.getByLabelText(/^Email address/i), 'Requester@Example.Test')
  await user.type(screen.getByLabelText(/^Password/i), 'Synthetic-Password-1!')
}

describe('SignInForm', () => {
  it('submits only verified fields and exposes accessible labels', async () => {
    const onSuccess = vi.fn()
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        expect(request.headers.has('X-CSRF-Token')).toBe(false)
        expect(await request.json()).toEqual({
          email: 'requester@example.test',
          password: 'Synthetic-Password-1!',
        })
        return HttpResponse.json({ data: authFixture() })
      }),
    )
    const { user } = renderWithProviders(<SignInForm onSuccess={onSuccess} />)

    expect(screen.getByLabelText(/^Email address/i)).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText(/^Password/i)).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('keeps invalid credentials generic and within the form', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Email or password is incorrect.',
              requestId: 'req-login-invalid',
            },
          },
          { status: 401 },
        ),
      ),
    )
    const { user } = renderWithProviders(<SignInForm onSuccess={vi.fn()} />)
    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      (await screen.findByText('Email or password is incorrect.')).closest(
        '[role="alert"]',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Password/i)).toHaveValue('Synthetic-Password-1!')
  })

  it('honors login throttling guidance and disables duplicate attempts', async () => {
    let requests = 0
    server.use(
      http.post('*/api/v1/auth/login', async () => {
        requests += 1
        await delay(20)
        return HttpResponse.json(
          { error: { code: 'LOGIN_RATE_LIMITED', message: 'Try again later.' } },
          { status: 429, headers: { 'Retry-After': '3' } },
        )
      }),
    )
    const { user } = renderWithProviders(<SignInForm onSuccess={vi.fn()} />)
    await fillCredentials(user)
    const submit = screen.getByRole('button', { name: 'Sign in' })
    await user.dblClick(submit)

    expect(await screen.findByRole('button', { name: /try again in 3s/i })).toBeDisabled()
    expect(screen.getByText(/too many sign-in attempts/i)).toBeInTheDocument()
    expect(requests).toBe(1)
  })

  it('associates client validation errors with their fields', async () => {
    const { user } = renderWithProviders(<SignInForm onSuccess={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const email = screen.getByLabelText(/^Email address/i)
    const password = screen.getByLabelText(/^Password/i)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(email.getAttribute('aria-describedby')).toContain('error')
    expect(password.getAttribute('aria-describedby')).toContain('error')
  })
})
