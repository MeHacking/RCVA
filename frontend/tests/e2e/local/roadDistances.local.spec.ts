import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// Road distances from OpenRouteService in the application on the device. ORS is faked
// with page.route, so no request leaves the test and no real key is needed.

async function fakeOrs(page: Page, status = 200) {
  const asked: { profile: string; key: string | null }[] = []
  await page.route('https://api.openrouteservice.org/**', async (route) => {
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

  // The distances are kept: after a reload a new job asks nothing.
  await page.reload()
  await start(page)
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
