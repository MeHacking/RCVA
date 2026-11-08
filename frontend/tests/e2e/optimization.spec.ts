import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Default mock scenario "small": 2 routes on "Šleper 1" and "Šleper 2"; the job completes in ~4 s.

test('shows instructions before the first run', async ({ page }) => {
  await page.goto('/optimization')
  await expect(page.getByText('Optimizacija još nije pokretana', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Vremensko ograničenje (s)')).toHaveValue('60')
})

test('rejects an invalid time limit without starting a job', async ({ page }) => {
  await page.goto('/optimization')
  const limit = page.getByLabel('Vremensko ograničenje (s)')
  await limit.fill('0')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()

  await expect(page.getByText('Unesite ceo broj sekundi veći od 0.')).toBeVisible()
  await expect(limit).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByTestId('last-job-status')).toContainText('Nije pokretano')
})

test('runs a job and shows summary, validator, routes and unassigned shipments', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('30')
  const start = page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' })
  await start.click()

  await expect(page.getByText(/vremensko ograničenje 30 s · status se osvežava/)).toBeVisible()
  await expect(start).toBeDisabled()

  const routes = page.getByRole('table', { name: 'Kamioni i rute' })
  await expect(routes).toBeVisible({ timeout: 10_000 })
  await expect(start).toBeEnabled()

  const stats = page.locator('.stats')
  await expect(stats).toContainText('Kamioni2')
  await expect(stats).toContainText('jednako donjoj granici po kapacitetu')
  // The score is no card any more: its place is "Izvezi ceo rezultat (PDF)", the last card of the row.
  await expect(stats).not.toContainText(/hard|medium|soft/)
  await expect(stats.locator(':scope > *').last()).toHaveText(/^Izvezi ceo rezultat \(PDF\)/)
  await expect(page.getByText('Validator: rešenje je prošlo nezavisnu proveru')).toBeVisible()

  const firstTruck = routes.getByRole('row', { name: /Šleper 1/ })
  // Only the count in the row (names can be long); the names and relations open in a window.
  await expect(firstTruck).not.toContainText('S-105')
  const count = firstTruck.getByRole('button', { name: '3 pošiljke: Šleper 1' })
  await count.click()
  const dialog = page.getByRole('dialog', { name: 'Šleper 1: 3 pošiljke' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('rowheader')).toHaveText(['S-105', 'S-103', 'S-104'])
  await expect(dialog.getByRole('row', { name: /S-105/ })).toContainText('→')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(count).toBeFocused()
  // A click beside the window closes it too.
  await count.click()
  await page.mouse.click(5, 5)
  await expect(dialog).toHaveCount(0)
  await expect(firstTruck.getByRole('meter', { name: 'Popunjenost' })).toHaveAttribute(
    'aria-valuetext',
    '13,4 / 13,6 LDM · 99 %',
  )
  await expect(firstTruck.getByRole('link', { name: '3D prikaz' })).toHaveAttribute('href', '/truck-3d?job=1&truck=1')
  await expect(firstTruck.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/route-map?job=1&truck=1')

  const toggle = firstTruck.getByRole('button', { name: 'Stanice (6)' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const stops = page.getByRole('list', { name: 'Stanice: Šleper 1' }).getByRole('listitem')
  await expect(stops).toHaveCount(8) // base + 6 stops + return
  await expect(stops.nth(1)).toContainText('Preuzimanje')
  await expect(stops.nth(1)).toContainText('Leskovac')
  await expect(stops.nth(6)).toContainText('Isporuka')
  await expect(stops.nth(6)).toContainText('na kamionu 0,0 LDM')
  await toggle.click()
  await expect(page.getByRole('list', { name: 'Stanice: Šleper 1' })).toBeHidden()

  await expect(page.getByText('Sve pošiljke su dodeljene kamionima.')).toBeVisible()
  expect(errors).toEqual([])
})

test('a result survives navigating away and back', async ({ page }) => {
  await page.goto('/optimization')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('navigation').getByRole('link', { name: 'Kamioni' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Rezultati optimizacije' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible()
})
