import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The application on the device (VITE_API_MODE=local) over the "small" scenario: the job
// is really solved by the TS solver in a Web Worker, with open routes and rear loading.
// Which trucks carry what is up to the solver, so only its invariants are checked.

test('solves in the browser and shows open routes, the validator and the 3D plan', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await expect(page.getByText('Na uređaju (probni početni podaci)')).toBeVisible()

  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  const routes = page.getByRole('table', { name: 'Kamioni i rute' })
  await expect(routes).toBeVisible({ timeout: 20_000 })

  const stats = page.locator('.stats')
  await expect(stats).toContainText('Kamioni2')
  await expect(stats).toContainText('jednako donjoj granici po kapacitetu')
  await expect(stats).toContainText('od prvog utovara do poslednjeg istovara')
  await expect(page.getByText('Validator: rešenje je prošlo nezavisnu proveru')).toBeVisible()
  await expect(page.getByText('Sve pošiljke su dodeljene kamionima.')).toBeVisible()

  // An open route: no base before the first stop and no return after the last.
  const toggle = routes.getByRole('button', { name: /^Stanice \(\d+\)$/ }).first()
  const count = Number((await toggle.textContent())?.match(/\d+/)?.[0])
  await toggle.click()
  const stops = page.getByRole('list', { name: /^Stanice: / }).getByRole('listitem')
  await expect(stops).toHaveCount(count)
  await expect(stops.first()).toContainText('Preuzimanje')
  await expect(stops.first()).toContainText('početak rute')
  await expect(stops.last()).toContainText('Isporuka')

  await page.getByRole('navigation').getByRole('link', { name: '3D prikaz kamiona' }).click()
  await page.getByRole('group', { name: 'Izbor kamiona' }).getByRole('button').first().click()
  await expect(page.locator('[data-testid=truck-visualizer][data-state=ready]')).toBeVisible({ timeout: 15_000 })
  expect(errors).toEqual([])
})
