import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Default mock scenario "small": routes on "Šleper 1" (6 stops) and "Šleper 2" (4 stops).
// The last job lives in memory, so tests navigate inside the app instead of page.goto().
// Map tiles come from a fake tile server (page.route), so no request reaches OpenStreetMap.

// 1 x 1 transparent PNG
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
let tiles: string[] = []

test.beforeEach(async ({ page }) => {
  tiles = []
  await page.route('https://tile.openstreetmap.org/**', (route) => {
    tiles.push(route.request().url())
    return route.fulfill({ body: TILE, contentType: 'image/png' })
  })
})

const map = (page: Page) => page.getByRole('region', { name: 'Mapa ruta' })

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

test('draws every route and its places on the map, and only the chosen truck when filtered', async ({ page }) => {
  const errors = collectPageErrors(page)
  await runJob(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Mapa ruta' }).click()

  await expect(map(page)).toBeVisible()
  await expect(map(page).locator('path.map-route')).toHaveCount(2)
  // The mock has no roads: dashed straight lines, and the caption says so.
  await expect(map(page).locator('path.map-route--straight')).toHaveCount(2)
  await expect(map(page).locator('path.map-route').first()).toHaveAttribute('stroke-dasharray', '8 8')
  await expect(page.getByTestId('map-caption')).toContainText(
    'Isprekidane linije spajaju stanice redom obilaska pravom linijom, ne po putu. U ovom režimu nema podataka o putevima.',
  )
  const places = Number(await map(page).getAttribute('data-places'))
  expect(places).toBeGreaterThan(2)
  await expect(map(page).locator('path.map-place')).toHaveCount(places)
  // Mock routes return to the base: one dark mark.
  await expect(map(page).locator('path.map-place--base')).toHaveCount(1)
  await expect(map(page).getByText('© OpenStreetMap contributors')).toBeVisible()
  expect(tiles.length).toBeGreaterThan(0)
  expect(tiles.every((url) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(url))).toBe(true)
  // Leaflet's plus-lighter blending washes the tiles out completely inside the isolated map.
  await expect(map(page).locator('img.leaflet-tile').first()).toHaveCSS('mix-blend-mode', 'normal')

  // The same truck color on the button, the card and the line.
  const filter = page.getByRole('group', { name: 'Izbor rute' })
  await filter.getByRole('button', { name: 'Šleper 2' }).click()
  await expect(map(page).locator('path.map-route')).toHaveCount(1)
  const swatch = await filter.getByRole('button', { name: 'Šleper 2' }).locator('.route-swatch').evaluate((e) => getComputedStyle(e).backgroundColor)
  const line = await map(page).locator('path.map-route').evaluate((e) => getComputedStyle(e).stroke)
  expect(line).toBe(swatch)

  // A place's tooltip says which truck stops there and for what.
  await map(page).locator('path.map-place--pickup').first().hover()
  await expect(page.locator('.leaflet-tooltip')).toContainText(/Šleper 2 · \d+\. preuzimanje /)
  expect(errors).toEqual([])
})

test('switching trucks and leaving the screen leave one map and no errors', async ({ page }) => {
  const errors = collectPageErrors(page)
  await runJob(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Mapa ruta' }).click()
  const filter = page.getByRole('group', { name: 'Izbor rute' })
  for (let i = 0; i < 10; i++) {
    await filter.getByRole('button', { name: i % 2 === 0 ? 'Šleper 1' : 'Sve rute (2)' }).click()
    await expect(map(page).locator('path.map-route')).toHaveCount(i % 2 === 0 ? 1 : 2)
  }
  await page.getByRole('navigation').getByRole('link', { name: 'Kamioni' }).click()
  await expect(page.locator('.leaflet-container')).toHaveCount(0)
  await page.getByRole('navigation').getByRole('link', { name: 'Mapa ruta' }).click()
  await expect(map(page).locator('path.map-route')).toHaveCount(2)
  await expect(page.locator('.leaflet-container')).toHaveCount(1)
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

test('the map goes full screen and back, and fills the page where the browser has no full screen', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.setViewportSize({ width: 1200, height: 800 })
  await runJob(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Mapa ruta' }).click()
  const button = page.getByRole('button', { name: 'Ceo ekran' })
  const size = async () => {
    const box = (await map(page).boundingBox())!
    return [Math.round(box.width), Math.round(box.height)]
  }
  /** A loaded tile covers the map's bottom right corner (Leaflet knows the map's real size). */
  const cornerTiled = () =>
    page.evaluate(() => {
      const box = document.querySelector('.route-map')!.getBoundingClientRect()
      const [x, y] = [box.right - 20, box.bottom - 20]
      return [...document.querySelectorAll('.route-map .leaflet-tile-loaded')].some((tile) => {
        const r = tile.getBoundingClientRect()
        return r.left <= x && x <= r.right && r.top <= y && y <= r.bottom
      })
    })
  const before = await size()
  expect(before[1]).toBeLessThan(800)

  // The browser's own full screen: the map's frame takes the screen, the map fills it.
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.fullscreenElement?.className)).toContain('route-map-frame')
  await expect.poll(size).toEqual([1200, 800])
  // Leaflet measured again: the larger map has tiles down to its far corner.
  await expect.poll(cornerTiled).toBe(true)
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  await expect.poll(size).toEqual(before)

  // Without it (some phones): spread over the page, above the bars; Esc closes.
  await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }))
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  await expect.poll(size).toEqual([1200, 800])
  await expect.poll(cornerTiled).toBe(true)
  await expect(button).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(size).toEqual(before)
  expect(errors).toEqual([])
})
