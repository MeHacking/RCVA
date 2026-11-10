import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// Road distances from OpenRouteService in the application on the device. ORS is faked
// with page.route, so no request leaves the test and no real key is needed.

async function fakeOrs(page: Page, status = 200) {
  const asked: { profile: string; key: string | null }[] = []
  await page.route('https://api.heigit.org/openrouteservice/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    asked.push({ profile: request.url().split('/').pop() ?? '', key: request.headers()['authorization'] ?? null })
    const body = request.postDataJSON() as { locations: number[][]; sources: number[]; destinations: number[] }
    const distances = body.sources.map((s) =>
      body.destinations.map((d) => {
        const [a, b] = [body.locations[s], body.locations[d]]
        return Math.round(130_000 * (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])))
      }),
    )
    await route.fulfill({ status, json: status === 200 ? { distances } : { error: 'Rate limit exceeded' }, headers: CORS })
  })
  return asked
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function saveKey(page: Page) {
  await page.goto('/settings')
  await page.getByLabel('Ključ za OpenRouteService').fill('probni-kljuc')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('Podešavanja su sačuvana.')).toBeVisible()
}

async function start(page: Page) {
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
}

test('without a key the result says the distances are great-circle', async ({ page }) => {
  const asked = await fakeOrs(page)
  await start(page)
  await expect(page.getByTestId('distance-source')).toHaveText(/^vazdušna linija, ne po putu/, { timeout: 20_000 })
  expect(asked).toEqual([])
})

test('with a key the job uses road distances from ORS, asked once', async ({ page }) => {
  const errors = collectPageErrors(page)
  const asked = await fakeOrs(page)
  await saveKey(page)
  await start(page)
  await expect(page.getByTestId('distance-source')).toHaveText(
    'po putu za teretna vozila (© openrouteservice.org by HeiGIT, © OpenStreetMap contributors)',
    { timeout: 20_000 },
  )
  expect(asked).toEqual([{ profile: 'driving-hgv', key: 'probni-kljuc' }])

  // The distances are kept: after a reload a new job asks nothing. The trucks' last
  // deliveries are proposed first; the same week again keeps where they were.
  await page.reload()
  await start(page)
  const check = page.getByRole('region', { name: 'Gde su kamioni?' })
  await check.getByRole('button', { name: 'Zadrži sve sadašnje lokacije' }).click()
  await expect(check.getByRole('status').last()).toHaveText('Svi kamioni imaju potvrđenu lokaciju.')
  await check.getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByTestId('last-job-status')).toContainText('Završeno', { timeout: 20_000 })
  expect(asked).toHaveLength(1)
  expect(errors).toEqual([])
})

test('when ORS refuses, no job starts and the reason is shown', async ({ page }) => {
  await fakeOrs(page, 429)
  await saveKey(page)
  await start(page)
  await expect(
    page.getByRole('main').getByText('OpenRouteService: potrošena je kvota upita (HTTP 429); pokušajte kasnije.', { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeHidden()
})

/**
 * The northernmost place of the first matrix is closed to lorries, and everything within
 * `zoneMeters` of it; with `reopens` only for the job. `snap` is ORS Snap's answer for a point
 * around it; the other places of the job are on the roads.
 */
async function fakeOrsWithClosedPlace(
  page: Page,
  snap: (point: number[], closed: number[]) => unknown,
  { reopens = false, zoneMeters = 1 }: { reopens?: boolean; zoneMeters?: number } = {},
) {
  let closed: number[] | null = null
  let places: number[][] = []
  let matrices = 0
  const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1]
  const answerFor = (p: number[]) => (!same(p, closed!) && places.some((place) => same(place, p)) ? { location: p } : snap(p, closed!))
  const snaps: { url: string; body: unknown }[] = []
  await page.route('https://api.heigit.org/openrouteservice/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().includes('/snap/')) {
      const body = request.postDataJSON() as { locations: number[][]; radius: number }
      snaps.push({ url: request.url(), body })
      return route.fulfill({ json: { locations: body.locations.map(answerFor) }, headers: CORS })
    }
    const body = request.postDataJSON() as { locations: number[][]; sources: number[]; destinations: number[] }
    closed ??= body.locations.reduce((north, p) => (p[1] > north[1] ? p : north))
    if (places.length === 0) places = body.locations
    const open = reopens && ++matrices > 1
    const isClosed = (p: number[]) => {
      const east = (p[0] - closed![0]) * Math.cos((closed![1] * Math.PI) / 180)
      return !open && Math.hypot(east, p[1] - closed![1]) * 111_195 < zoneMeters
    }
    const distances = body.sources.map((s) =>
      body.destinations.map((d) => {
        const [a, b] = [body.locations[s], body.locations[d]]
        if (s !== d && (isClosed(a) || isClosed(b))) return null
        return Math.round(130_000 * (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])))
      }),
    )
    await route.fulfill({ json: { distances }, headers: CORS })
  })
  return { snaps, closed: () => closed! }
}

// As the real ORS answers a point on the road: no snapped_distance at all.
const onTheSpot = (point: number[]) => ({ location: point, name: 'Lagerveien' })

test('a place on a road no lorry reaches goes to the nearest point one does, and the job runs', async ({ page }) => {
  const errors = collectPageErrors(page)
  await fakeOrsWithClosedPlace(page, onTheSpot)
  await saveKey(page)
  await start(page)
  const offer = page.getByRole('status').filter({ hasText: 'Mesta do kojih nema puta za kamione' })
  await offer.getByRole('button', { name: 'Pomeri na najbliži put za kamione' }).click({ timeout: 20_000 })

  const row = offer.getByRole('table', { name: 'Predlog pomeranja mesta' }).getByRole('row').nth(1)
  await expect(row).toContainText('0,3 km', { timeout: 20_000 })
  await expect(row.getByRole('checkbox')).toBeChecked()
  await offer.getByRole('button', { name: 'Primeni (1) i pokreni ponovo' }).click()
  await expect(page.getByTestId('distance-source')).toHaveText(/^po putu za teretna vozila/, { timeout: 20_000 })
  expect(errors).toEqual([])
})

test('widens the search kilometre by kilometre when nothing nearer is reached', async ({ page }) => {
  test.setTimeout(60_000)
  await fakeOrsWithClosedPlace(page, onTheSpot, { zoneMeters: 7500 })
  await saveKey(page)
  await start(page)
  const offer = page.getByRole('status').filter({ hasText: 'Mesta do kojih nema puta za kamione' })
  await offer.getByRole('button', { name: 'Pomeri na najbliži put za kamione' }).click({ timeout: 20_000 })
  const row = offer.getByRole('table', { name: 'Predlog pomeranja mesta' }).getByRole('row').nth(1)
  await expect(row).toContainText('8,0 km', { timeout: 30_000 })
  await expect(row.getByRole('checkbox')).toBeChecked()
})

test('past 10 km it says so, and still shows where the place is on the map', async ({ page }) => {
  test.setTimeout(90_000)
  await fakeOrsWithClosedPlace(page, onTheSpot, { zoneMeters: 20_000 })
  await saveKey(page)
  await start(page)
  const offer = page.getByRole('status').filter({ hasText: 'Mesta do kojih nema puta za kamione' })
  await offer.getByRole('button', { name: 'Pomeri na najbliži put za kamione' }).click({ timeout: 20_000 })
  const row = offer.getByRole('table', { name: 'Predlog pomeranja mesta' }).getByRole('row').nth(1)
  await expect(row).toContainText('nema tačke do koje kamion stiže u krugu od 10,0 km', { timeout: 60_000 })
  await expect(row.getByRole('link', { name: 'Gde je trenutna lokacija?' })).toHaveAttribute('href', /openstreetmap\.org/)
  await expect(row.getByRole('link', { name: 'Gde bi bila nova lokacija?' })).toHaveCount(0)
  await expect(row.getByRole('checkbox')).toBeDisabled()
  await expect(offer.getByRole('button', { name: 'Primeni (0) i pokreni ponovo' })).toBeDisabled()
})

test('does not offer to move a place lorries turn out to reach', async ({ page }) => {
  const errors = collectPageErrors(page)
  await fakeOrsWithClosedPlace(page, onTheSpot, { reopens: true })
  await saveKey(page)
  await start(page)
  const offer = page.getByRole('status').filter({ hasText: 'Mesta do kojih nema puta za kamione' })
  await offer.getByRole('button', { name: 'Pomeri na najbliži put za kamione' }).click({ timeout: 20_000 })

  const row = offer.getByRole('table', { name: 'Predlog pomeranja mesta' }).getByRole('row').nth(1)
  await expect(row).toContainText('Lagerveien', { timeout: 20_000 })
  await expect(row).toContainText('kamion stiže do ove tačke, pa pomeranje ne pomaže')
  await expect(row.getByRole('checkbox')).toBeDisabled()
  await expect(row.getByRole('checkbox')).not.toBeChecked()
  await expect(row.getByRole('link', { name: 'Gde bi bila nova lokacija?' })).toHaveCount(0)
  await expect(offer.getByRole('button', { name: 'Primeni (0) i pokreni ponovo' })).toBeDisabled()
  expect(errors).toEqual([])
})

test('moves a place no road for lorries reaches to the nearest road, once confirmed, and starts again', async ({ page }) => {
  const errors = collectPageErrors(page)
  // ORS Snap finds a road 0,02° north of the closed place and none around it; from there every road is fine.
  const ors = await fakeOrsWithClosedPlace(page, ([lon, lat], closed) =>
    lon === closed[0] && lat === closed[1] ? { location: [lon, lat + 0.02], name: 'Lagerveien', snapped_distance: 2224 } : null,
  )
  const { snaps } = ors
  await saveKey(page)
  await start(page)
  await expect(page.getByRole('main').getByText('Pokretanje nije uspelo', { exact: true })).toBeVisible({ timeout: 20_000 })

  // The places no road reaches, and the nearest road, asked for only on the button.
  const offer = page.getByRole('status').filter({ hasText: 'Mesta do kojih nema puta za kamione' })
  expect(snaps).toEqual([])
  await offer.getByRole('button', { name: 'Pomeri na najbliži put za kamione' }).click()
  const proposal = offer.getByRole('table', { name: 'Predlog pomeranja mesta' })
  await expect(proposal.getByRole('row')).toHaveCount(2) // header + the one closed place
  await expect(proposal.getByRole('row').nth(1)).toContainText('2,2 km', { timeout: 20_000 })
  await expect(proposal.getByRole('row').nth(1)).toContainText('Lagerveien · daleko: proverite da li je to još mesto istovara')
  expect(snaps).toHaveLength(1)
  expect(snaps[0].url).toBe('https://api.heigit.org/openrouteservice/v2/snap/driving-hgv/json')
  expect((snaps[0].body as { locations: number[][] }).locations[0]).toEqual(ors.closed())
  // Ticked at first; untick it and there is nothing to apply. Both points open on the OSM map.
  const place = (await proposal.getByRole('row').nth(1).getByRole('cell').nth(1).textContent())!
  const tick = proposal.getByRole('checkbox', { name: `Pomeri ${place}` })
  await expect(tick).toBeChecked()
  await tick.uncheck()
  await expect(offer.getByRole('button', { name: 'Primeni (0) i pokreni ponovo' })).toBeDisabled()
  await tick.check()
  const [lon, lat] = ors.closed()
  await expect(proposal.getByRole('link', { name: 'Gde je trenutna lokacija?' })).toHaveAttribute('href', new RegExp(`mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}`))
  await expect(proposal.getByRole('link', { name: 'Gde bi bila nova lokacija?' })).toHaveAttribute('href', new RegExp(`mlat=${(lat + 0.02).toFixed(5)}&`))

  // Applied: the place moves and the job runs, by road.
  await offer.getByRole('button', { name: 'Primeni (1) i pokreni ponovo' }).click()
  await expect(page.getByTestId('distance-source')).toHaveText(/^po putu za teretna vozila/, { timeout: 20_000 })

  // The place says it was moved, and goes back to where it was from a shipment's editor.
  await page.goto('/shipments')
  const row = page.getByRole('table', { name: 'Pošiljke' }).getByRole('row').filter({ hasText: place }).first()
  await row.getByRole('button', { name: /^Izmeni pošiljku/ }).click()
  const editor = page.getByRole('form', { name: /^Izmena pošiljke/ })
  await expect(editor).toContainText(/pomereno do puta za kamione, 2,2 km od izvorne tačke/)
  await editor.getByRole('button', { name: 'Vrati izvornu tačku' }).click()
  await expect(editor).toHaveCount(0)
  await row.getByRole('button', { name: /^Izmeni pošiljku/ }).click()
  await expect(editor).not.toContainText('pomereno do puta za kamione')
  await expect(editor.getByRole('button', { name: 'Vrati izvornu tačku' })).toHaveCount(0)
  expect(errors).toEqual([])
})
