import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The dashboard in the application on the device: a job uses only the trucks in the list,
// so too few of them is a warning, and so is a truck that does not know where it is.

test('warns about too few trucks, and about a truck without a location', async ({ page }) => {
  const errors = collectPageErrors(page)
  // Scenario "small": 20,9 LDM; Šleper 1 and 2 (13,6 LDM each) available, at the base.
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Ukloni Šleper 1' }).click()
  await page.getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: /Šleper 1/ })).toBeHidden()

  await page.goto('/')
  const card = (title: string) => page.locator('.stat').filter({ has: page.getByText(title, { exact: true }) })
  const warnings = page.getByRole('region', { name: 'Upozorenja' })
  await expect(card('Kamioni')).toContainText('dostupno od 2 · 13,6 LDM')
  await expect(card('Kamioni')).not.toContainText('standardne cerade')
  await expect(warnings).toContainText('Ukupno 20,9 LDM je više od kapaciteta dostupnih kamiona (13,6 LDM).')

  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('Nova cerada')
  await page.getByLabel('Kapacitet (LDM)').fill('13.6')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await page.goto('/')
  await expect(warnings).toContainText('Kamioni bez lokacije: 1. Pre optimizacije unesite gde se nalaze.')
  await expect(warnings).not.toContainText('Ukupno 20,9 LDM')
  expect(errors).toEqual([])
})
