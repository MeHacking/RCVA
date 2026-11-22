import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Default mock scenario "small": 2 routes on "Šleper 1" and "Šleper 2"; the job completes in ~4 s.

test('shows instructions before the first run', async ({ page }) => {
  await page.goto('/optimization/result')
  await expect(page.getByText('Optimizacija još nije pokretana', { exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Koraci optimizacije' }).getByRole('link', { name: 'Vreme' }).click()
  await expect(page).toHaveURL('/optimization/time')
  // The recommendation for the mock's 5 shipments (nothing chosen yet).
  await expect(page.getByLabel('Vremensko ograničenje (s)')).toHaveValue('10')
  await expect(page.getByRole('slider', { name: 'Trajanje' })).toHaveAttribute('aria-valuetext', '10 s')
})

// User, 21.11.2026: Optimizacija in steps, as in smartLoad+; the menu item opens the step last open.
test('goes through the steps of Optimizacija, and the old addresses lead to them', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Optimizacija' }).click()
  await expect(page).toHaveURL('/optimization/shipments')
  const steps = page.getByRole('navigation', { name: 'Koraci optimizacije' })
  // In the top bar, without numbers (user, 21.11.2026), and the job's chips are not there.
  await expect(page.getByRole('banner').getByRole('navigation', { name: 'Koraci optimizacije' })).toBeVisible()
  await expect(steps.getByRole('link')).toHaveText(['Pošiljke', 'Lokacije kamiona', 'Vreme', 'Rezultat'])
  await expect(page.getByTestId('last-job-status')).toHaveCount(0)
  await expect(page.getByRole('banner').getByRole('button', { name: 'Optimizuj' })).toBeVisible()
  await expect(page.getByText('Korak 1 od 4')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Pošiljke' })).toBeVisible()

  await page.getByRole('link', { name: 'Dalje: lokacije kamiona' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Lokacije kamiona' })).toBeVisible()
  // The mock has no truck locations: its routes start at the base.
  await expect(page.getByText('Kamioni kreću iz baze')).toBeVisible()
  await page.getByRole('link', { name: 'Dalje: vreme' }).click()
  await expect(page.getByText('Korak 3 od 4')).toBeVisible()
  await page.getByRole('link', { name: 'Nazad: lokacije kamiona' }).click()
  await expect(page).toHaveURL('/optimization/trucks')

  // The menu opens the step last open; the old addresses lead to the steps.
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Kamioni' }).click()
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Optimizacija' }).click()
  await expect(page).toHaveURL('/optimization/trucks')
  for (const [from, to] of [
    ['/shipments', '/optimization/shipments'],
    ['/shipments/import', '/optimization/shipments/import'],
    ['/route-map?truck=2', '/optimization/result/map?truck=2'],
    ['/truck-3d?job=1&truck=1', '/optimization/result/3d?job=1&truck=1'],
  ]) {
    await page.goto(from)
    await expect(page).toHaveURL(to)
  }
  expect(errors).toEqual([])
})

test('rejects an invalid time limit without starting a job', async ({ page }) => {
  await page.goto('/optimization/time')
  const limit = page.getByLabel('Vremensko ograničenje (s)')
  await limit.fill('0')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()

  await expect(page.getByText('Unesite ceo broj sekundi veći od 0.')).toBeVisible()
  await expect(limit).toHaveAttribute('aria-invalid', 'true')
  await expect(page).toHaveURL('/optimization/time')
  await page.getByRole('navigation', { name: 'Koraci optimizacije' }).getByRole('link', { name: 'Rezultat' }).click()
  await expect(page.getByText('Optimizacija još nije pokretana', { exact: true })).toBeVisible()
})

test('runs a job and shows summary, validator, routes and unassigned shipments', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization/time')
  await page.getByLabel('Vremensko ograničenje (s)').fill('30')
  const start = page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' })
  await start.click()

  // The job goes on in the step Rezultat.
  await expect(page).toHaveURL('/optimization/result')
  await expect(page.getByText(/vremensko ograničenje 30 s · status se osvežava/)).toBeVisible()

  const routes = page.getByRole('table', { name: 'Kamioni i rute' })
  await expect(routes).toBeVisible({ timeout: 10_000 })
  // The time chosen is kept for the next start (also from the top bar).
  await page.getByRole('link', { name: 'Nazad: vreme' }).click()
  await expect(page.getByLabel('Vremensko ograničenje (s)')).toHaveValue('30')
  await expect(start).toBeEnabled()
  await page.getByRole('link', { name: 'Dalje: rezultat' }).click()

  const stats = page.locator('.stats')
  await expect(stats).toContainText('Kamioni2')
  await expect(stats).toContainText('jednako donjoj granici po kapacitetu')
  // The score is no card any more: its place is "Izvezi ceo rezultat (PDF)", the last card of the row.
  await expect(stats).not.toContainText(/hard|medium|soft/)
  await expect(stats.locator(':scope > *').last()).toHaveText(/^Izvezi ceo rezultat \(PDF\)/)
  await expect(page.getByTestId('result-status')).toContainText('Rešeno')

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
  await expect(firstTruck.getByRole('link', { name: '3D prikaz' })).toHaveAttribute('href', '/optimization/result/3d?job=1&truck=1')
  await expect(firstTruck.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/optimization/result/map?job=1&truck=1')

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

  // One truck in focus: the table has only its row, and the choice stays on the map.
  const filter = page.getByRole('group', { name: 'Izbor rute' })
  await filter.getByRole('button', { name: 'Šleper 2' }).click()
  await expect(page).toHaveURL('/optimization/result?truck=2')
  await expect(routes.getByRole('row')).toHaveCount(2) // header + Šleper 2
  await expect(routes).toContainText('Šleper 2')
  await page.getByRole('navigation', { name: 'Prikaz rezultata' }).getByRole('link', { name: 'Mapa ruta' }).click()
  await expect(page).toHaveURL('/optimization/result/map?truck=2')
  await expect(filter.getByRole('button', { name: 'Šleper 2' })).toHaveAttribute('aria-pressed', 'true')
  await filter.getByRole('button', { name: 'Sve rute (2)' }).click()
  await page.getByRole('navigation', { name: 'Prikaz rezultata' }).getByRole('link', { name: 'Rute', exact: true }).click()
  await expect(routes.getByRole('row')).toHaveCount(3)
  expect(errors).toEqual([])
})

test('a result survives navigating away and back', async ({ page }) => {
  await page.goto('/optimization/time')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('navigation').getByRole('link', { name: 'Kamioni', exact: true }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Optimizacija' }).click()
  await expect(page).toHaveURL('/optimization/result')
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible()
})
