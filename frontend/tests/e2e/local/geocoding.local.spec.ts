import { expect, test, type Page } from '@playwright/test'
import writeExcelFile from 'write-excel-file/node'
import { collectPageErrors } from '../consoleGuard.ts'

// Coordinates from Nominatim in the application on the device. Nominatim is faked with
// page.route, so no request leaves the test; the fake knows only invented places.
const PLACES: Record<string, [number, number]> = {
  Primerovo: [45.1, 20.1],
  Drugovo: [44.5, 20.6],
  Teststad: [57.1, 12.1],
}

/**
 * Every request is timed in the page, where the application calls fetch: the time a request
 * reaches this test process varies with the load of the machine (it once measured 806 ms
 * for requests started 1000 ms apart).
 */
async function sentAt(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { nominatimSentAt: number[] }).nominatimSentAt)
}

async function fakeNominatim(page: Page) {
  await page.addInitScript(() => {
    const times: number[] = []
    ;(window as unknown as { nominatimSentAt: number[] }).nominatimSentAt = times
    const original = window.fetch.bind(window)
    window.fetch = (input, init) => {
      if (String(input instanceof Request ? input.url : input).startsWith('https://nominatim.openstreetmap.org/')) times.push(Date.now())
      return original(input, init)
    }
  })
  const asked: { q: string }[] = []
  await page.route('https://nominatim.openstreetmap.org/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    asked.push({ q })
    const place = PLACES[q]
    await route.fulfill({
      json: place ? [{ lat: String(place[0]), lon: String(place[1]), display_name: q }] : [],
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  })
  return asked
}

async function importFile(page: Page, name: string, rows: string[][]) {
  await page.goto('/shipments/import')
  await page.getByLabel('Fajl').setInputFiles({
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await writeExcelFile([['RELACIJA', 'TEŽINA', 'DIMENZIJE'], ...rows]).toBuffer(),
  })
  await page.getByRole('button', { name: 'Dalje: pregled redova' }).click()
  await page.getByRole('button', { name: 'Dalje: potvrda' }).click()
  await page.getByRole('button', { name: /^Upiši pošiljke/ }).click()
}

test('looks up new places one per second while committing, and keeps the answers', async ({ page }) => {
  const errors = collectPageErrors(page)
  const asked = await fakeNominatim(page)
  await importFile(page, 'prvi.xlsx', [
    ['PRIMEROVO - TESTSTAD 11111', '1,200 kg', '2,4m'],
    ['DRUGOVO - TESTSTAD 11111', '800 kg', '1,2m'],
    ['DRUGOVO - NEPOZNATOVO', '500 kg', '1m'],
  ])
  await expect(page.getByRole('status').filter({ hasText: 'Traženje koordinata' })).toBeVisible()
  await expect(page.getByText('Upisano pošiljki: 3')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Koordinate novih mesta: pronađeno 3, nije pronađeno 1.')).toBeVisible()

  expect(asked.map((a) => a.q)).toEqual(['Primerovo', 'Teststad', 'Drugovo', 'Nepoznatovo'])
  const sent = await sentAt(page)
  expect(sent).toHaveLength(asked.length)
  // At least a second between the starts, as the application spaces them (Nominatim's usage policy).
  for (let i = 1; i < sent.length; i++) expect(sent[i] - sent[i - 1]).toBeGreaterThanOrEqual(1000)

  // After a reload the same places are not asked again, not even the one that was not found.
  await page.reload()
  await importFile(page, 'drugi.xlsx', [['PRIMEROVO - NEPOZNATOVO', '300 kg', '1m']])
  await expect(page.getByText('Upisano pošiljki: 1')).toBeVisible()
  await expect(page.getByText('Koordinate novih mesta: pronađeno 0, nije pronađeno 1.')).toBeVisible()
  expect(asked).toHaveLength(4)

  // The places Nominatim found are routed; the one it did not find is not.
  await page.getByRole('link', { name: 'Pogledaj pošiljke' }).click()
  const shipments = page.getByRole('table', { name: 'Pošiljke' })
  await expect(shipments.getByRole('row', { name: /PRI-TES-1/ })).toContainText('U redu')
  await expect(shipments.getByRole('row', { name: /DRU-NEP-1/ })).toContainText('Nejasna lokacija')
  expect(errors).toEqual([])
})

test('asks nothing when switched off in the settings', async ({ page }) => {
  const asked = await fakeNominatim(page)
  await page.goto('/settings')
  await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible()
  await page.getByLabel('Traži koordinate preko Nominatim-a').uncheck()
  await page.getByLabel('E-adresa za Nominatim (neobavezno)').fill('nije adresa')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('Unesite ispravnu e-adresu ili ostavite polje prazno.')).toBeVisible()
  await page.getByLabel('E-adresa za Nominatim (neobavezno)').fill('')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('Podešavanja su sačuvana.')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Traži koordinate preko Nominatim-a')).not.toBeChecked()
  await importFile(page, 'treci.xlsx', [['PRIMEROVO - TESTSTAD 11111', '1,200 kg', '2,4m']])
  await expect(page.getByText('Upisano pošiljki: 1')).toBeVisible()
  await expect(page.getByText('Traženje koordinata je isključeno u podešavanjima.', { exact: false })).toBeVisible()
  expect(asked).toEqual([])
})
