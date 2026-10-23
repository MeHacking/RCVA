import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Default mock scenario "small": 5 shipments (20,9 LDM), 2 of 3 trucks available (27,2 LDM).

const card = (page: import('@playwright/test').Page, label: string) =>
  page.locator('.stat').filter({ has: page.getByText(label, { exact: true }) })

test('shows cards, no warnings and an empty last-job summary', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')

  await expect(card(page, 'Pošiljke').locator('.stat__value')).toHaveText('5')
  await expect(card(page, 'Ukupno LDM')).toContainText('20,9')
  await expect(card(page, 'Ukupno LDM')).toContainText('najmanje kamiona po kapacitetu: 2')
  await expect(card(page, 'Kamioni')).toContainText('dostupno od 3 · 27,2 LDM')
  await expect(card(page, 'Pošiljke sa greškom').locator('.stat__value')).toHaveText('0')

  await expect(page.getByText('Nema upozorenja za trenutne pošiljke i kamione.')).toBeVisible()
  const lastJob = page.getByRole('region', { name: 'Poslednja optimizacija' })
  await expect(lastJob).toContainText('Optimizacija još nije pokretana.')
  expect(errors).toEqual([])
})

test('runs an optimization from the quick actions and shows its summary', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('region', { name: 'Brze akcije' }).getByRole('button', { name: 'Pokreni optimizaciju' }).click()

  const lastJob = page.getByRole('region', { name: 'Poslednja optimizacija' })
  await expect(lastJob).toContainText('Validator: prošao', { timeout: 10_000 })
  await expect(lastJob).toContainText('Kamioni2 (donja granica 2)')
  await expect(lastJob).toContainText(/\d+,\d km/)
  await lastJob.getByRole('link', { name: 'Detalji rezultata' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible()
})

test('quick actions open the import wizard and the trucks screen', async ({ page }) => {
  await page.goto('/')
  const actions = page.getByRole('region', { name: 'Brze akcije' })
  await actions.getByRole('button', { name: 'Uvezi Excel' }).click()
  await expect(page).toHaveURL('/shipments/import')
  await page.goBack()
  await actions.getByRole('button', { name: 'Uredi kamione' }).click()
  await expect(page).toHaveURL('/trucks')
})
