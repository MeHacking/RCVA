import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Default mock scenario "small": routes on "Šleper 1" (6 stops) and "Šleper 2" (4 stops).
// The last job lives in memory, so tests navigate inside the app instead of page.goto().

async function runJob(page: Page) {
  await page.goto('/optimization')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 10_000 })
}

/** Client-side navigation that keeps in-memory state (like clicking a link). */
async function navigate(page: Page, url: string) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, url)
}

const routeCards = (page: Page) => page.getByRole('main').getByRole('article')

test('without a job it explains where routes come from', async ({ page }) => {
  await page.goto('/route-map')
  await expect(page.getByText('Nema ruta za prikaz')).toBeVisible()
  await page.getByRole('link', { name: 'Pokrenite optimizaciju' }).click()
  await expect(page).toHaveURL('/optimization')
})

test('lists all routes with their stops and filters by truck', async ({ page }) => {
  const errors = collectPageErrors(page)
  await runJob(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Mapa ruta' }).click()

  await expect(routeCards(page)).toHaveCount(2)
  const first = routeCards(page).filter({ hasText: 'Šleper 1' })
  await expect(first.getByRole('listitem')).toHaveCount(8) // base + 6 stops + return
  await expect(first.getByRole('meter', { name: 'Popunjenost' })).toHaveAttribute(
    'aria-valuetext',
    '13,4 / 13,6 LDM · 99 %',
  )

  const filter = page.getByRole('group', { name: 'Izbor rute' })
  await filter.getByRole('button', { name: 'Šleper 2' }).click()
  await expect(page).toHaveURL('/route-map?truck=2')
  await expect(routeCards(page)).toHaveCount(1)
  await expect(routeCards(page).first()).toContainText('Šleper 2')
  await expect(filter.getByRole('button', { name: 'Šleper 2' })).toHaveAttribute('aria-pressed', 'true')

  await filter.getByRole('button', { name: 'Sve rute (2)' }).click()
  await expect(page).toHaveURL('/route-map')
  await expect(routeCards(page)).toHaveCount(2)
  expect(errors).toEqual([])
})

test('the "Mapa" link in the results table opens that truck', async ({ page }) => {
  await runJob(page)
  await page.getByRole('row', { name: /Šleper 1/ }).getByRole('link', { name: 'Mapa' }).click()

  await expect(page).toHaveURL('/route-map?job=1&truck=1')
  await expect(routeCards(page)).toHaveCount(1)
  await expect(routeCards(page).first()).toContainText('Šleper 1')
  await expect(page.getByText(/nije dostupan|nema rutu/)).toHaveCount(0)
})

test('warns about an unknown job or truck and shows all routes', async ({ page }) => {
  await runJob(page)
  await navigate(page, '/route-map?job=99&truck=42')

  await expect(page.getByText('Posao #99 nije dostupan')).toBeVisible()
  await expect(page.getByText('Kamion #42 nema rutu u ovom rezultatu')).toBeVisible()
  await expect(routeCards(page)).toHaveCount(2)
})
