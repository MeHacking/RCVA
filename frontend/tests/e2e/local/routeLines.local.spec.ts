import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// Road lines on the map in the application on the device. ORS (matrix and directions) and
// the map tiles are faked with page.route, so no request leaves the test.

const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** `lines.status` decides how the directions answer; the matrix always answers. */
async function fakeOrs(page: Page) {
  const lines = { asked: 0, status: 200 }
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: TILE, contentType: 'image/png' }))
  await page.route('https://api.heigit.org/openrouteservice/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().includes('/directions/')) {
      lines.asked++
      if (lines.status !== 200) return route.fulfill({ status: lines.status, json: { error: 'Rate limit exceeded' }, headers: CORS })
      // The road bends north halfway between every two waypoints.
      const { coordinates } = request.postDataJSON() as { coordinates: number[][] }
      const road = coordinates.flatMap((to, i) => {
        const from = coordinates[i - 1]
        return from ? [[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.3], to] : [to]
      })
      return route.fulfill({ json: { features: [{ geometry: { type: 'LineString', coordinates: road } }] }, headers: CORS })
    }
    const body = request.postDataJSON() as { locations: number[][]; sources: number[]; destinations: number[] }
    const distances = body.sources.map((s) =>
      body.destinations.map((d) => {
        const [a, b] = [body.locations[s], body.locations[d]]
        return Math.round(130_000 * (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])))
      }),
    )
    await route.fulfill({ json: { distances }, headers: CORS })
  })
  return lines
}

async function saveKey(page: Page) {
  await page.goto('/settings')
  await page.getByLabel('Ključ za OpenRouteService').fill('probni-kljuc')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('Podešavanja su sačuvana.')).toBeVisible()
}

async function solve(page: Page) {
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 20_000 })
}

const map = (page: Page) => page.getByRole('region', { name: 'Mapa ruta' })

async function openMap(page: Page): Promise<number> {
  await page.getByRole('navigation').getByRole('link', { name: 'Mapa ruta' }).click()
  await expect(map(page)).toBeVisible()
  const routes = Number(await map(page).getAttribute('data-routes'))
  expect(routes).toBeGreaterThan(0)
  return routes
}

test('without a key the routes are dashed straight lines, and the caption says how to get road lines', async ({ page }) => {
  const errors = collectPageErrors(page)
  const lines = await fakeOrs(page)
  await solve(page)
  const routes = await openMap(page)

  await expect(map(page).locator('path.map-route--straight')).toHaveCount(routes)
  await expect(map(page).locator('path.map-route--road')).toHaveCount(0)
  await expect(map(page).locator('path.map-route').first()).toHaveAttribute('stroke-dasharray', '8 8')
  const caption = page.getByTestId('map-caption')
  await expect(caption).toContainText('Isprekidane linije spajaju stanice redom obilaska pravom linijom, ne po putu.')
  await expect(caption).toContainText('Za linije po putu unesite ključ za OpenRouteService u Podešavanjima.')
  await caption.getByRole('link', { name: 'Podešavanjima' }).click()
  await expect(page).toHaveURL('/settings')
  expect(lines.asked).toBe(0)
  expect(errors).toEqual([])
})

test('with a key the routes follow the road, each asked once, also after a reload', async ({ page }) => {
  const errors = collectPageErrors(page)
  const lines = await fakeOrs(page)
  await saveKey(page)
  await solve(page)
  const routes = await openMap(page)

  await expect(map(page).locator('path.map-route--road')).toHaveCount(routes)
  await expect(map(page).locator('path.map-route--straight')).toHaveCount(0)
  await expect(map(page).locator('path.map-route').first()).not.toHaveAttribute('stroke-dasharray', /./)
  await expect(page.getByTestId('map-caption')).toContainText(
    'Linije prate put za teretna vozila redom obilaska (© openrouteservice.org by HeiGIT).',
  )
  expect(lines.asked).toBe(routes)

  // Filtering asks nothing; neither does the map after a reload (the lines are kept).
  const filter = page.getByRole('group', { name: 'Izbor rute' })
  await filter.getByRole('button').nth(1).click()
  await expect(map(page).locator('path.map-route--road')).toHaveCount(1)
  await page.reload()
  await expect(map(page).locator('path.map-route--road')).toHaveCount(1)
  await filter.getByRole('button', { name: /^Sve rute/ }).click()
  await expect(map(page).locator('path.map-route--road')).toHaveCount(routes)
  expect(lines.asked).toBe(routes)
  expect(errors).toEqual([])
})

test('when ORS refuses the lines, the routes stay straight with the reason, and a retry draws them', async ({ page }) => {
  const lines = await fakeOrs(page)
  await saveKey(page)
  await solve(page)
  lines.status = 429
  const routes = await openMap(page)

  const notice = page.getByRole('status').filter({ hasText: 'Linije po putu nisu dostupne' })
  await expect(notice).toContainText(`Linije po putu nisu dostupne (${routes})`)
  await expect(notice).toContainText('OpenRouteService: potrošena je kvota upita (HTTP 429); pokušajte kasnije.')
  await expect(map(page).locator('path.map-route--straight')).toHaveCount(routes)

  lines.status = 200
  await notice.getByRole('button', { name: 'Pokušaj ponovo' }).click()
  await expect(map(page).locator('path.map-route--road')).toHaveCount(routes)
  await expect(notice).toBeHidden()
  expect(lines.asked).toBe(2 * routes)
})
