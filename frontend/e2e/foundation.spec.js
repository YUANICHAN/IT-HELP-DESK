import { expect, test } from '@playwright/test'

test('shows the non-sensitive Deskflow foundation', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Deskflow' })).toBeVisible()
  await expect(
    page.getByText(/does not perform authentication or grant access/i),
  ).toBeVisible()
})
