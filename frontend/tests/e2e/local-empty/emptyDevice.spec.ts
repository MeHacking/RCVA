import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// A dev server started without VITE_API_MODE and VITE_MOCK_SCENARIO, as `npm run dev`: the
// default is the application on the device, and a new device starts without data.

test('runs on the device by default and starts empty', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  await expect(page.getByTestId('data-source')).toHaveText('Na uređaju')
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Podešavanja' })).toBeVisible()
  await expect(page.locator('.stat').filter({ hasText: 'Pošiljke' }).first()).toContainText('0')

  await page.goto('/shipments')
  await expect(page.getByText('Nema unetih pošiljki')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ukloni sve pošiljke' })).toBeDisabled()
  await page.goto('/trucks')
  await expect(page.getByRole('table', { name: 'Kamioni' })).toHaveCount(0)
  expect(errors).toEqual([])
})
