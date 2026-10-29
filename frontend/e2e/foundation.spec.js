import { expect, test } from '@playwright/test'

const identity = {
  user: {
    id: '507f1f77bcf86cd799439012',
    displayName: 'Synthetic Requester',
    email: 'requester@example.test',
    role: 'EMPLOYEE',
    accountStatus: 'ACTIVE',
    mustChangePassword: false,
  },
  organization: {
    id: '507f1f77bcf86cd799439013',
    name: 'Synthetic Organization',
  },
  department: {
    id: '507f1f77bcf86cd799439014',
    name: 'Operations',
  },
  permissions: [],
  session: {
    id: '507f1f77bcf86cd799439011',
    client: {
      browser: 'Google Chrome',
      operatingSystem: 'Windows',
      deviceType: 'desktop',
    },
    createdAt: '2026-10-29T08:00:00.000Z',
    lastSeenAt: '2026-10-29T10:00:00.000Z',
    idleExpiresAt: '2026-10-29T10:30:00.000Z',
    absoluteExpiresAt: '2026-11-05T08:00:00.000Z',
    isCurrent: true,
  },
  csrfToken: 'synthetic-csrf-token',
}

test('restores a verified session before showing the protected foundation', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { data: identity },
    }),
  )

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Deskflow' })).toBeVisible()
  await expect(page.getByText(/welcome, synthetic requester/i)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Account security' })).toBeVisible()
})

test('shows sign-in when the bootstrap request is unauthenticated', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: {
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required.',
        },
      },
      status: 401,
    }),
  )

  await page.goto('/security')

  await expect(page.getByRole('heading', { name: 'Sign in to Deskflow' })).toBeVisible()
  await expect(page.getByLabel('Email address')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in$/)
  const hasPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(hasPageOverflow).toBe(false)
})
