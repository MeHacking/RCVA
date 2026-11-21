import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The map on Kamioni (user, 21.11.2026): a pin where each truck is. Scenario "small": Šleper 1
// and 2 available, Solo 1 unavailable, all three at the base. Tiles come from a fake server.

const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: TILE, contentType: 'image/png' }))
})

const map = (page: Page) => page.getByRole('region', { name: 'Mapa kamiona' })
const pins = (page: Page) => map(page).locator('.truck-pin')

test('shows a pin where the trucks are, one per place, and follows a new location', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/trucks')
  await expect(map(page)).toBeVisible()
  await expect(pins(page)).toHaveCount(1)
  await expect(pins(page).first()).toHaveAttribute('aria-label', 'Beograd – magacin: Šleper 1, Šleper 2, Solo 1 (nije dostupan)')
  await expect(pins(page).first()).toContainText('3')

  // A new truck is nowhere yet: no pin, named under the map.
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('Nova cerada')
  await page.getByLabel('Kapacitet (LDM)').fill('13.6')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  const card = page.getByRole('region', { name: 'Kamioni na mapi' })
  await expect(card).toContainText('Bez lokacije (1): Nova cerada.')
  await expect(pins(page)).toHaveCount(1)

  // Once it has one, its own pin (Subotica is a place the device knows).
  await page.getByRole('button', { name: 'Unesi lokaciju za Nova cerada' }).click()
  await page.getByRole('form', { name: 'Lokacija kamiona Nova cerada' }).getByLabel('Mesto').fill('Subotica')
  await page.getByRole('button', { name: 'Sačuvaj lokaciju' }).click()
  await expect(pins(page)).toHaveCount(2)
  await expect(map(page).getByLabel('Subotica: Nova cerada')).toBeVisible()
  await expect(card).not.toContainText('Bez lokacije')

  // The place and its trucks when the pin is pointed at.
  await map(page).getByLabel('Subotica: Nova cerada').hover()
  await expect(map(page).locator('.leaflet-tooltip')).toContainText('Subotica')
  expect(errors).toEqual([])
})

test('shows the last delivery proposed after a job as a dashed pin until it is answered', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('1')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 20_000 })

  await page.goto('/trucks')
  await expect(map(page).locator('.truck-pin--proposal').first()).toBeVisible()
  const proposals = await map(page).locator('.truck-pin--proposal').count()
  expect(proposals).toBeGreaterThan(0)
  await expect(map(page).locator('.truck-pin--proposal').first()).toHaveAttribute('aria-label', /, predlog posle optimizacije: Šleper/)
  await expect(page.getByText('Isprekidana čioda je predlog posle optimizacije')).toBeVisible()

  // Confirmed: the truck's pin moves there, and the proposal's pin is gone.
  const confirm = page.getByRole('button', { name: /^Potvrdi predlog za / })
  for (let left = await confirm.count(); left > 0; left--) {
    await confirm.first().click()
    await expect(confirm).toHaveCount(left - 1)
  }
  await expect(map(page).locator('.truck-pin--proposal')).toHaveCount(0)
  await expect(map(page).locator('.truck-pin--location')).toHaveCount(1 + proposals)
  await expect(page.getByText('Isprekidana čioda')).toBeHidden()
  expect(errors).toEqual([])
})
