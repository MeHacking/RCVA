import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The application on the device keeps its data in IndexedDB: a page reload (or a new
// tab in the same browser) shows the same trucks and the last job. Every Playwright test
// gets a new browser context, so it starts empty, from the scenario "small".

test('keeps a new truck and the last result after a page reload', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('Cerada sa uređaja')
  await page.getByLabel('Kapacitet (LDM)').fill('13.6')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByRole('row', { name: /Cerada sa uređaja/ })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('row', { name: /Cerada sa uređaja/ })).toContainText('13,6')
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(5) // header + 3 + 1

  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  const routes = page.getByRole('table', { name: 'Kamioni i rute' })
  await expect(routes).toBeVisible({ timeout: 20_000 })
  const summary = await page.locator('.stats').textContent()

  await page.reload()
  await expect(routes).toBeVisible()
  await expect(page.locator('.stats')).toHaveText(summary ?? '')
  await expect(page.getByText('Validator: rešenje je prošlo nezavisnu proveru')).toBeVisible()
  expect(errors).toEqual([])
})

test('shows a job cut off by a reload as failed, and can start a new one', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('60')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  const status = page.getByTestId('last-job-status')
  await expect(status).toContainText(/U toku|U redu čekanja/)

  await page.reload()
  await expect(status).toContainText('Greška solvera')
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 20_000 })
  expect(errors).toEqual([])
})
