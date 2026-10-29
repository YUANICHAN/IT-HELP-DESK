import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1440, height: 1000 },
]

for (const viewport of viewports) {
  test(`component gallery reflows without page overflow at ${viewport.name} width`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/dev/components')

    await expect(
      page.getByRole('heading', { name: 'Deskflow Blue component gallery' }),
    ).toBeVisible()
    await expect(page.getByText('Preview only.')).toBeVisible()

    const hasPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasPageOverflow).toBe(false)
  })
}

test('component gallery confirmation dialog opens and closes by keyboard', async ({ page }) => {
  await page.goto('/dev/components')
  const trigger = page.getByRole('button', { name: 'Open confirmation dialog' })

  await trigger.click()
  await expect(
    page.getByRole('dialog', { name: 'Remove DF-1048 from the preview?' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(trigger).toBeFocused()
})
