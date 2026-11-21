import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The step "Vreme" recommends a time by the number of shipments (measured 21.11.2026), and warns
// when less is set. The scenario "small" has 5 shipments: 10 s.
test('recommends a time for the shipments and warns about less', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization/time')
  const field = page.getByLabel('Vremensko ograničenje (s)')
  await expect(page.getByText('Preporučeno: najmanje 10 s za 5 pošiljki.')).toBeVisible()
  await expect(field).toHaveValue('10')
  const warning = page.getByText('Kraće od preporuke')
  await expect(warning).toHaveCount(0)

  await field.fill('3')
  await expect(warning).toBeVisible()
  await page.getByRole('button', { name: 'Koristi preporuku (10 s)' }).click()
  await expect(field).toHaveValue('10')
  await expect(warning).toHaveCount(0)

  // A longer time is kept, also after a reload.
  await field.fill('45')
  await page.reload()
  await expect(field).toHaveValue('45')
  expect(errors).toEqual([])
})
