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

test('shows the load against the trucks, the shipments by status and the trucks of the last result', async ({ page }) => {
  await page.goto('/')
  // Scenario "small": 20,9 LDM on Šleper 1 and 2 (27,2 LDM), weight not limited.
  await expect(page.getByRole('meter', { name: 'LDM prema kapacitetu' })).toHaveAttribute('aria-valuetext', '20,9 LDM od 27,2 LDM · 77 %')
  await expect(page.getByText('nosivost nije ograničena')).toBeVisible()
  await expect(page.getByRole('img', { name: /^Pošiljke po statusu, ukupno 5: U redu 5, Ručno uneta lokacija 0, Nejasna lokacija 0$/ })).toBeVisible()

  await page.getByRole('region', { name: 'Brze akcije' }).getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  const loads = page.getByRole('list', { name: 'Popunjenost kamiona' })
  await expect(loads.getByRole('listitem')).toHaveCount(2, { timeout: 15_000 })
  await expect(loads.getByRole('meter').first()).toHaveAttribute('aria-valuetext', / LDM od 13,6 LDM · \d+ %$/)
  await expect(page.getByRole('list', { name: 'Kilometri po kamionu' }).getByRole('listitem')).toHaveCount(2)
})
