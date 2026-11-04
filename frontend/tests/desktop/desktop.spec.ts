import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import writeExcelFile from 'write-excel-file/node'
import { collectPageErrors } from '../e2e/consoleGuard.ts'

// The desktop application as the user starts it: Electron over the web build, on its own
// origin app://rcva/, with its data in a folder of its own (here a temporary one). No
// request leaves the test: map tiles, Nominatim and OpenRouteService are faked.
// With RCVA_DESKTOP_EXE (e.g. release/win-unpacked/RCVA.exe) the same tests run against the
// packed application, which reads its files from app.asar.

const APP_DIR = path.resolve(import.meta.dirname, '../../electron')
const PACKED = process.env.RCVA_DESKTOP_EXE
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }
const PLACES: Record<string, [number, number]> = { Primerovo: [45.1, 20.1], Teststad: [57.1, 12.1] }

let userData: string
let running: ElectronApplication[] = []
test.beforeEach(() => {
  userData = mkdtempSync(path.join(tmpdir(), 'rcva-desktop-'))
})
test.afterEach(async () => {
  // Also after a failure; on Windows Electron lets go of its files a moment after closing.
  for (const app of running) await app.close().catch(() => undefined)
  running = []
  rmSync(userData, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
})

/** Seen requests to the outside, with their User-Agent. */
const outside: { url: string; userAgent: string }[] = []

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  // VS Code sets ELECTRON_RUN_AS_NODE for its child processes; Electron would then run as plain Node.
  const env = Object.fromEntries(
    // RCVA_PDF_PATH: where "Izvezi PDF" writes, instead of asking with a dialog.
    Object.entries({ ...process.env, RCVA_USER_DATA: userData, RCVA_PDF_PATH: path.join(userData, 'rezultat.pdf') }).filter(
      (entry): entry is [string, string] => entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined,
    ),
  )
  const app = await electron.launch(PACKED ? { executablePath: path.resolve(PACKED), env } : { args: [APP_DIR], env })
  running.push(app)
  const page = await app.firstWindow()
  const seen = (url: string, headers: Record<string, string>) => outside.push({ url, userAgent: headers['user-agent'] ?? '' })
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: TILE, contentType: 'image/png' }))
  await page.route('https://nominatim.openstreetmap.org/**', async (route) => {
    seen(route.request().url(), route.request().headers())
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    const place = PLACES[q]
    await route.fulfill({ json: place ? [{ lat: String(place[0]), lon: String(place[1]), display_name: q }] : [], headers: CORS })
  })
  await page.route('https://api.heigit.org/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    seen(route.request().url(), route.request().headers())
    await route.fulfill({ status: 401, json: { error: 'Authorization field missing' }, headers: CORS })
  })
  return { app, page }
}

test('starts empty on its own origin, and every screen loads, also after a reload', async () => {
  const { app, page } = await launch()
  const errors = collectPageErrors(page)
  await expect(page.getByTestId('data-source')).toHaveText('Na uređaju')
  expect(page.url()).toBe('app://rcva/')
  expect(await page.title()).toBe('RCVA – rutiranje i vizualizacija')

  for (const [link, url, heading] of [
    ['Pošiljke', 'app://rcva/shipments', 'Pošiljke'],
    ['Mapa ruta', 'app://rcva/route-map', 'Mapa ruta'],
    ['Podešavanja', 'app://rcva/settings', 'Podešavanja'],
  ] as const) {
    await page.getByRole('navigation').getByRole('link', { name: link }).click()
    await expect(page).toHaveURL(url)
    // A reload asks app://rcva/<screen> itself: the application answers with index.html.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
  // Nothing outside the web build is served: a path that climbs out gets index.html. ("%2e%2e"
  // would be resolved by the browser already; an encoded slash reaches the application.)
  const climbed = await page.evaluate(() => fetch('app://rcva/..%2Fmain.mjs').then((r) => r.text()))
  expect(climbed).toContain('<div id="root">')
  expect(climbed).not.toContain('electron')
  expect(errors).toEqual([])
  await app.close()
})

test('introduces itself to the services with its own User-Agent', async () => {
  const { app, page } = await launch()
  outside.length = 0
  expect(await page.evaluate(() => navigator.userAgent)).toMatch(/^RCVA\/1\.0\.0 /)
  await page.evaluate(() => fetch('https://api.heigit.org/openrouteservice/v2/matrix/driving-hgv', { method: 'POST', body: '{}' }))
  expect(outside).toEqual([{ url: 'https://api.heigit.org/openrouteservice/v2/matrix/driving-hgv', userAgent: expect.stringMatching(/^RCVA\/1\.0\.0 /) }])
  await app.close()
})

test('imports, solves in its Web Worker, and keeps the data after a restart', async () => {
  let { app, page } = await launch()
  outside.length = 0
  await page.getByRole('navigation').getByRole('link', { name: 'Pošiljke' }).click()
  await page.getByRole('button', { name: 'Uvezi Excel' }).click()
  await page.getByLabel('Fajl').setInputFiles({
    name: 'nedelja.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await writeExcelFile([
      ['RELACIJA', 'TEŽINA', 'DIMENZIJE'],
      ['PRIMEROVO - TESTSTAD 11111', '1,200 kg', '2,4m'],
      ['TESTSTAD - PRIMEROVO', '800 kg', '1,2m'],
    ]).toBuffer(),
  })
  await page.getByRole('button', { name: 'Dalje: pregled redova' }).click()
  await page.getByRole('button', { name: 'Dalje: potvrda' }).click()
  await page.getByRole('button', { name: /^Upiši pošiljke/ }).click()
  // Two places: Teststad with and without its number is one place (the number is not compared).
  await expect(page.getByText('Koordinate novih mesta: pronađeno 2, nije pronađeno 0.')).toBeVisible({ timeout: 15_000 })
  expect(outside.map((r) => new URL(r.url).searchParams.get('q'))).toEqual(['Primerovo', 'Teststad'])
  expect(outside.every((r) => r.userAgent.startsWith('RCVA/1.0.0 '))).toBe(true)

  // An empty device has no trucks: one is added, at a place the device knows now (no lookup).
  await page.getByRole('navigation').getByRole('link', { name: 'Kamioni' }).click()
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('Kamion 1')
  await page.getByLabel('Kapacitet (LDM)').fill('13.6')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await page.getByRole('button', { name: 'Unesi lokaciju za Kamion 1' }).click()
  await page.getByRole('form', { name: 'Lokacija kamiona Kamion 1' }).getByLabel('Mesto').fill('Primerovo')
  await page.getByRole('button', { name: 'Sačuvaj lokaciju' }).click()
  await expect(page.getByRole('table', { name: 'Lokacije kamiona' })).toContainText('Sačuvano: „Primerovo“.')
  expect(outside).toHaveLength(2)

  await page.getByRole('navigation').getByRole('link', { name: 'Rezultati optimizacije' }).click()
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Validator: rešenje je prošlo nezavisnu proveru')).toBeVisible()

  // The results as a PDF file, written by the application itself: the summary and one truck.
  const pdfPath = path.join(userData, 'rezultat.pdf')
  await page.getByRole('button', { name: 'Izvezi PDF' }).click()
  await expect(page.getByText(`PDF je sačuvan: ${pdfPath}`)).toBeVisible({ timeout: 15_000 })
  const pdf = readFileSync(pdfPath)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2)
  await app.close()

  ;({ app, page } = await launch())
  await page.getByRole('navigation').getByRole('link', { name: 'Pošiljke' }).click()
  await expect(page.getByRole('table', { name: 'Pošiljke' }).getByRole('row')).toHaveCount(3)
  await page.getByRole('navigation').getByRole('link', { name: 'Rezultati optimizacije' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible()
  await app.close()
})

test('opens links to other sites in the browser, not in the application', async () => {
  const { app, page } = await launch()
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    Object.assign(globalThis, { opened })
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  await page.getByRole('navigation').getByRole('link', { name: 'Podešavanja' }).click()
  const newWindow = app.waitForEvent('window', { timeout: 1500 }).catch(() => null)
  await page.getByRole('link', { name: 'account.heigit.org' }).click()
  await expect.poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)).toEqual(['https://account.heigit.org/'])
  expect(await newWindow).toBeNull()
  expect(app.windows()).toHaveLength(1)
  expect(page.url()).toBe('app://rcva/settings')
  await app.close()
})
