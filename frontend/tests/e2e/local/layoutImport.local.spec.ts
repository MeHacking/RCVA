import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'
import { layoutText } from '../../unit/layoutFile.ts'

// A layout from smartLoad+ on the 3D screen (only on the device): checked and shown first, then
// applied to the chosen shipment, which becomes its pieces in the 3D view and in the PDF, keeps
// them after a reload, and is one block again after "Ukloni". Scenario "small".

interface Probe {
  pieces: () => number[]
  selected: () => number[]
  screenOf: (shipmentId: number) => { x: number; y: number } | null
}

const probe = (page: Page) =>
  page.evaluate(() => {
    const p = (document.querySelector('.truck3d canvas') as HTMLCanvasElement & { rcvaProbe: Probe }).rcvaProbe
    return { pieces: p.pieces(), selected: p.selected() }
  })

/** The invented layout, 2600 mm long (2,6 LDM, which no shipment of the scenario has) and 2140 kg. */
const LAYOUT = layoutText((f) => (f.load.lengthMm = 2600))

const choose = (page: Page, name: string, content: string) =>
  page.getByLabel('Fajl sa rasporedom iz smartLoad+').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) })

async function ready(page: Page) {
  await expect(page.locator('[data-testid=truck-visualizer][data-state=ready]')).toBeVisible({ timeout: 15_000 })
}

test('imports a layout from smartLoad+ for a shipment, shows it piece by piece, and removes it', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('1')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('navigation').getByRole('link', { name: '3D prikaz kamiona' }).click()
  await ready(page)
  await expect(page.getByText('Detaljan raspored iz smartLoad+ uvozi se za izabranu pošiljku')).toBeVisible()

  // The first shipment in the list of the first truck.
  const list = page.locator('.truck-3d__shipments')
  const first = list.getByRole('button').first()
  const name = (await first.locator('.truck-3d__id').textContent())!
  const id = Number(name.replace(/\D/g, ''))
  const blocks = (await probe(page)).pieces
  const heading = await page.locator('#truck-3d-shipments').textContent()
  const picture = await page.locator('.truck3d').getAttribute('aria-label')
  await first.click()
  const panel = page.getByRole('region', { name: `Raspored iz smartLoad+: ${name}` })
  await expect(panel).toBeVisible()

  // A file that is no layout: nothing changes.
  await choose(page, 'podaci.json', '{"format":"rcva-podaci","version":1}')
  await expect(panel.getByRole('alert')).toContainText('Raspored nije uvezen: Ovo nije raspored iz smartLoad+')

  // A layout: what it changes, before anything changes; "Odustani" leaves the shipment as it was.
  await choose(page, 'raspored-2,6-LDM.json', LAYOUT)
  const review = panel.getByRole('status').filter({ hasText: 'Raspored „2,4 LDM - Proba“' })
  await expect(review).toContainText('Fajl raspored-2,6-LDM.json')
  await expect(review).toContainText('7 komada')
  await expect(review.getByRole('list', { name: 'Šta se menja' })).toContainText('→ 2,6')
  await expect(review.getByRole('list', { name: 'Šta se menja' })).toContainText('→ 2140 kg')
  await expect(review.getByRole('list', { name: 'Upozorenja' })).toHaveText('U smartLoad+ nije stalo komada: 1.')
  await review.getByRole('button', { name: 'Odustani' }).click()
  await expect(review).toBeHidden()
  expect((await probe(page)).pieces).toEqual(blocks)

  // Applied: the shipment is its seven pieces, with the layout's LDM, and the result is out of date.
  await choose(page, 'raspored-2,6-LDM.json', LAYOUT)
  await review.getByRole('button', { name: 'Primeni' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Raspored „2,4 LDM - Proba“ je uvezen za pošiljku ${name}` })).toContainText(
    'Pokrenite optimizaciju ponovo',
  )
  await expect.poll(async () => (await probe(page)).pieces.filter((p) => p === id).length).toBe(7)
  await expect(page.locator('#truck-3d-shipments')).toHaveText(heading!)
  // The picture counts shipments, not pieces.
  await expect(page.locator('.truck3d')).toHaveAttribute('aria-label', picture!)
  await expect(first).toContainText('2,6 LDM')
  await expect(first).toContainText('7 komada (smartLoad+)')
  await expect(page.getByText('Upozorenja rasporeda')).toBeVisible()
  await expect(page.locator('.notice__list')).toContainText(`zauzima 2,6 LDM; pokrenite optimizaciju ponovo.`)
  await expect(panel).toContainText('Pošiljka ima raspored „2,4 LDM - Proba“ (7 komada).')

  // A click on any piece picks the whole shipment. (The page went down to the panel under the
  // view; the view comes back to the middle, clear of the top bar.)
  await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'false')
  expect((await probe(page)).selected).toEqual([])
  await page.locator('.truck3d').evaluate((view) => view.scrollIntoView({ block: 'center' }))
  // From above: obliquely, the higher blocks nearer the doors can hide the pallets.
  await page.getByRole('group', { name: 'Pogled' }).getByRole('button', { name: 'Odozgo' }).click()
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  const at = await page.evaluate((shipment) => {
    const p = (document.querySelector('.truck3d canvas') as HTMLCanvasElement & { rcvaProbe: Probe }).rcvaProbe
    return p.screenOf(shipment)
  }, id)
  await page.mouse.click(at!.x, at!.y)
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  expect((await probe(page)).selected).toEqual(Array(7).fill(id))
  await expect(page.locator('.truck-view__info')).toContainText('7 komada iz smartLoad+')

  // The PDF draws the pieces too, with one number for the shipment.
  const drawing = page.getByTestId('result-report').locator('svg.load-drawing').first()
  await page.getByRole('navigation').getByRole('link', { name: 'Rezultati optimizacije' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible()
  await expect(drawing.locator(`g[data-shipment="${id}"]`)).toHaveCount(7)
  await expect(drawing.locator(`text[data-shipment="${id}"]`)).toHaveCount(1)

  // Kept on the device.
  await page.reload()
  await page.getByRole('navigation').getByRole('link', { name: '3D prikaz kamiona' }).click()
  await ready(page)
  await expect(first).toContainText('7 komada (smartLoad+)')

  // Removed: one block again, the LDM stays.
  await first.click()
  await panel.getByRole('button', { name: 'Ukloni uvezeni raspored' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Pošiljka ${name} je ponovo jedan blok` })).toBeVisible()
  await expect.poll(async () => (await probe(page)).pieces.filter((p) => p === id).length).toBe(1)
  await expect(first).not.toContainText('komada')
  await expect(first).toContainText('2,6 LDM')
  await expect(panel.getByRole('button', { name: 'Ukloni uvezeni raspored' })).toBeHidden()
  expect(errors).toEqual([])
})
