import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The dashboard in the application on the device: every job gets standard trucks as needed
// (B1), so too few own trucks is not a warning there (the mock warns, see dashboard.spec.ts).

test('does not warn about too few own trucks, since standard trucks are added as needed', async ({ page }) => {
  const errors = collectPageErrors(page)
  // Scenario "small": 20,9 LDM; Šleper 1 and 2 (13,6 LDM each) available. Without Šleper 1
  // the own trucks carry 13,6 LDM.
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Ukloni Šleper 1' }).click()
  await page.getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('row', { name: /Šleper 1/ })).toBeHidden()

  await page.goto('/')
  const card = (title: string) => page.locator('.stat').filter({ hasText: title })
  await expect(card('Kamioni')).toContainText('dostupno od 2 · 13,6 LDM + standardne cerade po potrebi')
  await expect(card('Ukupno LDM')).toContainText('najmanje kamiona po kapacitetu: 2')
  await expect(page.getByRole('region', { name: 'Upozorenja' })).toContainText('Nema upozorenja za trenutne pošiljke i kamione.')
  expect(errors).toEqual([])
})
