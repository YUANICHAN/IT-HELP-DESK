import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { replaceCsrfToken } from '../../shared/api/authIntegration.js'
import { authFixture } from '../../test/fixtures/auth.js'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import { server } from '../../test/server.js'
import ChangePasswordForm from './ChangePasswordForm.jsx'

async function fillPasswordForm(user, confirmation = 'Updated-Password-2!') {
  await user.type(screen.getByLabelText(/^Current password/i), 'Current-Password-1!')
  await user.type(screen.getByLabelText(/^New password/i), 'Updated-Password-2!')
  await user.type(screen.getByLabelText(/^Confirm new password/i), confirmation)
}

describe('ChangePasswordForm', () => {
  it('validates confirmation before sending credentials', async () => {
    const { user } = renderWithProviders(<ChangePasswordForm onSuccess={vi.fn()} />)
    await fillPasswordForm(user, 'Different-Password-3!')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Confirm new password/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('sends the verified payload with CSRF and clears fields after rotation', async () => {
    const onSuccess = vi.fn()
    const rotated = authFixture({ csrfToken: 'rotated-csrf-token' })
    replaceCsrfToken('current-csrf-token')
    server.use(
      http.post('*/api/v1/auth/change-password', async ({ request }) => {
        expect(request.headers.get('X-CSRF-Token')).toBe('current-csrf-token')
        expect(await request.json()).toEqual({
          currentPassword: 'Current-Password-1!',
          newPassword: 'Updated-Password-2!',
        })
        return HttpResponse.json({ data: rotated })
      }),
    )
    const { user } = renderWithProviders(<ChangePasswordForm onSuccess={onSuccess} />)
    await fillPasswordForm(user)
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(rotated))
    expect(screen.getByLabelText(/^Current password/i)).toHaveValue('')
    expect(screen.getByLabelText(/^New password/i)).toHaveValue('')
    expect(screen.getByLabelText(/^Confirm new password/i)).toHaveValue('')
  })

  it('maps an incorrect current password to the labelled field', async () => {
    replaceCsrfToken('current-csrf-token')
    server.use(
      http.post('*/api/v1/auth/change-password', () =>
        HttpResponse.json(
          {
            error: {
              code: 'CURRENT_PASSWORD_INCORRECT',
              message: 'Current password is incorrect.',
            },
          },
          { status: 400 },
        ),
      ),
    )
    const { user } = renderWithProviders(<ChangePasswordForm onSuccess={vi.fn()} />)
    await fillPasswordForm(user)
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Current password/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })
})
