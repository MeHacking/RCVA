import { expect, test, type Page } from '@playwright/test'
import writeExcelFile from 'write-excel-file/node'
import { collectPageErrors } from '../consoleGuard.ts'

// Where the trucks are, trucks that are missing, and the advice "one more truck", in the
// application on the device over the scenario "small" (Šleper 1 and 2 available, at the
// base; Solo 1 unavailable). Subotica is a place the device knows, so it is never looked up.

async function startOnResults(page: Page) {
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).first().click()
}

async function placeTruck(page: Page, truck: string, place: string) {
  await page.getByRole('button', { name: `Unesi lokaciju za ${truck}` }).click()
  await page.getByRole('form', { name: `Lokacija kamiona ${truck}` }).getByLabel('Mesto').fill(place)
  await page.getByRole('button', { name: 'Sačuvaj lokaciju' }).click()
  await expect(page.getByRole('table', { name: 'Lokacije kamiona' }).getByRole('row').filter({ has: page.getByRole('cell', { name: truck, exact: true }) })).toContainText(place)
}

const routesTable = (page: Page) => page.getByRole('table', { name: 'Kamioni i rute' })

// Each job solves twice (the second time for the advice "one more truck").
test.setTimeout(120_000)

test('asks where a new truck is before a job, and starts only then', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('Nova cerada')
  await page.getByLabel('Kapacitet (LDM)').fill('13.6')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  // The top bar sends the user to the question.
  await page.goto('/shipments')
  await page.getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page).toHaveURL('/optimization')
  const check = page.getByRole('region', { name: 'Gde su kamioni?' })
  await expect(check.getByRole('row', { name: /Nova cerada/ })).toContainText('Nije uneta')
  await expect(check.getByRole('button', { name: 'Pokreni optimizaciju' })).toBeDisabled()
  await expect(check).toContainText('Čeka odgovor: 1 kamion.')
  await expect(page.getByTestId('last-job-status')).toContainText('Lokacije kamiona')

  await placeTruck(page, 'Nova cerada', 'Subotica')
  await expect(check).toContainText('Svi kamioni imaju potvrđenu lokaciju.')
  // Started again from the form, with a short time limit (the top bar uses 60 s).
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).first().click()
  await expect(routesTable(page)).toBeVisible({ timeout: 60_000 })
  expect(errors).toEqual([])
})

test('proposes each truck its last delivery, used only once confirmed', async ({ page }) => {
  const errors = collectPageErrors(page)
  await startOnResults(page)
  await expect(routesTable(page)).toBeVisible({ timeout: 60_000 })

  await page.goto('/trucks')
  const locations = page.getByRole('table', { name: 'Lokacije kamiona' })
  const row = locations.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Šleper 1', exact: true }) })
  await expect(row).toContainText('Beograd – magacin')
  await expect(row).toContainText('poslednja isporuka u optimizaciji #1')
  await page.getByRole('button', { name: 'Potvrdi predlog za Šleper 1' }).click()
  await expect(row).toContainText('Sačuvano')
  await expect(row).not.toContainText('poslednja isporuka')
  await expect(row).not.toContainText('Beograd – magacin')

  // Šleper 2 still waits: the next job asks for it first.
  await startOnResults(page)
  const check = page.getByRole('region', { name: 'Gde su kamioni?' })
  await expect(check).toContainText('Čeka odgovor: 1 kamion.')
  await page.getByRole('button', { name: 'Zadrži sadašnju lokaciju za Šleper 2' }).click()
  await check.getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('main').getByText('Posao #2')).toBeVisible({ timeout: 60_000 })
  expect(errors).toEqual([])
})

test('says when trucks are missing: plans without some shipments, or adds a truck', async ({ page }) => {
  const errors = collectPageErrors(page)
  // Without Šleper 1 only 13,6 LDM of 20,9 LDM fit.
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Ukloni Šleper 1' }).click()
  await page.getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: /Šleper 1/ })).toBeHidden()

  await startOnResults(page)
  const refused = page.getByRole('alert').filter({ hasText: 'Nema dovoljno kamiona' })
  await expect(refused).toContainText('potrebno je još najmanje 1.')
  await refused.getByRole('button', { name: 'Optimizuj bez nekih pošiljki' }).click()

  const shortage = page.getByRole('status').filter({ hasText: 'Nema dovoljno kamiona: nedodeljenih pošiljki' })
  await expect(shortage).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('table', { name: 'Nedodeljene pošiljke' })).toBeVisible()

  // One more curtain-sider: it is asked where it is, then the job runs.
  await shortage.getByRole('button', { name: 'Dodaj 1 ceradu' }).click()
  const check = page.getByRole('region', { name: 'Gde su kamioni?' })
  await expect(check.getByRole('row', { name: /Kamion 1/ })).toContainText('Nije uneta')
  await placeTruck(page, 'Kamion 1', 'Subotica')
  // The plan without some shipments proposed Šleper 2 its last delivery; it stays where it was.
  await page.getByRole('button', { name: 'Zadrži sadašnju lokaciju za Šleper 2' }).click()
  await check.getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByText('Sve pošiljke su dodeljene kamionima.')).toBeVisible({ timeout: 60_000 })
  expect(errors).toEqual([])
})

// Test 7 around the scenario's base (Beograd – magacin, where the trucks are): on two
// trucks every route carries an 8,0 LDM and a 5,0 LDM shipment across (about 1000 km); one
// more truck makes it about 570 km. Nominatim is faked with these invented places.
const BASE = { lat: 44.8125, lon: 20.4612 }
const AT = (x: number, y: number) => [BASE.lat + y / 111.2, BASE.lon + x / 78.9] as const
const PLACES: Record<string, readonly [number, number]> = {
  Prvomesto: AT(-50, 0),
  Drugomesto: AT(100, 0),
  Trecemesto: AT(-50, 10),
  Cetvrtomesto: AT(100, 10),
  Petomesto: AT(50, 0),
  Sestomesto: AT(-100, 0),
  Sedmomesto: AT(50, 10),
  Osmomesto: AT(-100, 10),
}

test('advises one more truck when it saves kilometres, and follows the advice', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.route('https://nominatim.openstreetmap.org/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    const place = PLACES[q]
    await route.fulfill({
      json: place ? [{ lat: String(place[0]), lon: String(place[1]), display_name: q }] : [],
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  })
  await page.goto('/shipments')
  await page.getByRole('button', { name: 'Ukloni sve pošiljke' }).click()
  await page.getByRole('button', { name: 'Da, ukloni sve' }).click()
  await expect(page.getByText('Nema unetih pošiljki')).toBeVisible()

  await page.goto('/shipments/import')
  await page.getByLabel('Fajl').setInputFiles({
    name: 'nedelja.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await writeExcelFile([
      ['RELACIJA', 'TEŽINA', 'DIMENZIJE'],
      ['PRVOMESTO - DRUGOMESTO', '1,000 kg', '8m'],
      ['TRECEMESTO - CETVRTOMESTO', '1,000 kg', '8m'],
      ['PETOMESTO - SESTOMESTO', '1,000 kg', '5m'],
      ['SEDMOMESTO - OSMOMESTO', '1,000 kg', '5m'],
    ]).toBuffer(),
  })
  await page.getByRole('button', { name: 'Dalje: pregled redova' }).click()
  await page.getByRole('button', { name: 'Dalje: potvrda' }).click()
  await page.getByRole('button', { name: /^Upiši pošiljke/ }).click()
  await expect(page.getByText('Upisano pošiljki: 4', { exact: true })).toBeVisible({ timeout: 20_000 })

  await startOnResults(page)
  const advice = page.getByRole('status').filter({ hasText: 'Sa jednim kamionom više bilo bi manje kilometara' })
  await expect(advice).toBeVisible({ timeout: 60_000 })
  await expect(advice).toContainText(/Sa 3 kamiona ukupno bi bilo [\d,]+ km umesto [\d,]+ km \(−\d+ %\)\./)
  await expect(advice).toContainText('Za to treba još jedan kamion.')
  await expect(page.locator('.stats')).toContainText('Kamioni2')

  await advice.getByRole('button', { name: 'Dodaj kamion i pokreni ponovo' }).click()
  await placeTruck(page, 'Kamion 1', 'Prvomesto')
  // The same week again: Šleper 1 and 2 stay at the base (their last deliveries are only proposed).
  await page.getByRole('button', { name: 'Zadrži sve sadašnje lokacije' }).click()
  await page.getByRole('region', { name: 'Gde su kamioni?' }).getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('main').getByText('Posao #2')).toBeVisible({ timeout: 60_000 })
  await expect(routesTable(page)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.stats')).toContainText('Kamioni3')
  expect(errors).toEqual([])
})
