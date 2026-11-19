import { expect, test, type Locator, type Page } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// "Uredi" on the 3D screen (only on the device; as the Rezultat step of smartLoad): the floor
// from above and the 3D view, where a whole shipment is dragged, moved by the arrows and turned;
// the rules show live; saving with broken rules asks first; the plan stays after a reload and
// the computed one comes back on request. Scenario "small".

interface Probe {
  pieces: () => number[]
  selected: () => number[]
  screenOf: (shipmentId: number) => { x: number; y: number } | null
}

async function ready(page: Page) {
  await expect(page.locator('[data-testid=truck-visualizer][data-state=ready]')).toBeVisible({ timeout: 15_000 })
}

/** The shipments on the floor, from the front wall to the doors, with where each starts (cm). */
async function floor(page: Page): Promise<{ id: number; x: number; y: number; w: number; h: number }[]> {
  const rects = page.locator('[data-testid=load-editor-floor] rect[data-shipment]')
  const all = await rects.evaluateAll((list) =>
    list.map((r) => ({
      id: Number(r.getAttribute('data-shipment')),
      x: Number(r.getAttribute('x')),
      y: Number(r.getAttribute('y')),
      w: Number(r.getAttribute('width')),
      h: Number(r.getAttribute('height')),
    })),
  )
  return all.sort((a, b) => a.x - b.x)
}

const rectOf = (page: Page, id: number) => page.locator(`[data-testid=load-editor-floor] rect[data-shipment="${id}"]`).first()

async function centre(target: Locator) {
  const box = (await target.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y, { steps: 2 })
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

test('arranges a truck\'s load by hand, keeps it, and gives the computed one back', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('1')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('navigation').getByRole('link', { name: '3D prikaz kamiona' }).click()
  await ready(page)
  // A truck whose shipments come off at more than one place (shipments of one place come off together).
  let destinations = new Map<number, string>()
  for (const button of await page.locator('.route-filter button').all()) {
    await button.click()
    await ready(page)
    const rows = await page.locator('button.truck-3d__shipment').evaluateAll((list) =>
      list.map((b) => [b.querySelector('.truck-3d__id')!.textContent!, b.querySelector('.truck-3d__route')!.textContent!.split('→')[1].trim()]),
    )
    destinations = new Map(rows.map(([name, to]) => [Number(name.replace(/\D/g, '')), to]))
    if (new Set(destinations.values()).size > 1) break
  }
  expect(new Set(destinations.values()).size).toBeGreaterThan(1)
  const truckName = (await page.locator('.route-filter button[aria-pressed=true]').textContent())!

  // "Uredi" is left of "Ceo ekran".
  const bar = page.locator('.truck-view__actions button')
  await expect(bar).toHaveText(['Uredi', 'Ceo ekran'])
  await page.getByRole('button', { name: 'Uredi', exact: true }).click()
  const editor = page.getByRole('region', { name: `Uređivanje rasporeda: ${truckName}` })
  await expect(editor).toBeVisible()
  await expect(page.getByRole('group', { name: 'Mere rasporeda' })).toContainText('Dužina')
  await expect(page.getByRole('meter', { name: 'Zauzeta dužina' })).toBeVisible()
  await expect(editor.getByText('Sva pravila su ispunjena.')).toBeVisible()
  const save = editor.getByRole('button', { name: 'Sačuvaj raspored' })
  await expect(save).toBeDisabled()
  await ready(page)

  const start = await floor(page)
  expect(start.length).toBeGreaterThanOrEqual(2)
  const front = start[0] // unloaded last
  const doors = start[start.length - 1] // unloaded first
  expect(destinations.get(front.id)).not.toBe(destinations.get(doors.id))
  const width = Number(await page.locator('.load-editor__deck').getAttribute('height'))

  // Dragged on the floor: what comes off last onto what comes off first, which then cannot get out.
  await page.locator('.load-editor__floor').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await dragTo(page, await centre(rectOf(page, front.id)), await centre(rectOf(page, doors.id)))
  const problems = editor.getByRole('complementary', { name: 'Izabrano i pravila' })
  await expect(problems).toContainText('ne može da izađe: na njoj je')
  await expect(problems).toContainText('Visina dna')
  await expect(problems).toContainText('(na drugoj pošiljci)')
  const moved = (await floor(page)).find((p) => p.id === front.id)!
  expect(moved.x).not.toBe(front.x)
  await expect(save).toBeEnabled()

  // Undo and redo.
  await editor.getByRole('button', { name: 'Poništi' }).click()
  await expect(editor.getByText('Sva pravila su ispunjena.')).toBeVisible()
  expect((await floor(page)).find((p) => p.id === front.id)).toEqual(front)
  await editor.getByRole('button', { name: 'Ponovi' }).click()
  await expect(problems).toContainText('ne može da izađe')

  // Arrows move the chosen shipment by the step; R turns it.
  await editor.getByRole('button', { name: 'Poništi' }).click()
  await rectOf(page, doors.id).click()
  await editor.getByRole('group', { name: 'Korak strelica' }).getByRole('button', { name: '10 cm' }).click()
  await page.getByRole('application', { name: /Pod kamiona odozgo/ }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await floor(page)).find((p) => p.id === doors.id)!.x).toBe(doors.x - 10)
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await floor(page)).find((p) => p.id === doors.id)!.y).toBe(Math.min(doors.y + 10, width - doors.h))
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  expect((await floor(page)).find((p) => p.id === doors.id)).toEqual(doors)
  await page.keyboard.press('r')
  await expect.poll(async () => (await floor(page)).find((p) => p.id === doors.id)!.w).toBe(doors.h)

  // Dragged in the 3D view (from above, so nothing hides the blocks): the floor follows.
  await page.keyboard.press('Control+z')
  await editor.getByRole('group', { name: 'Pogled' }).getByRole('button', { name: 'Odozgo' }).click()
  const canvas = editor.locator('.truck3d canvas')
  const at = async (id: number) =>
    canvas.evaluate((c, shipmentId) => (c as HTMLCanvasElement & { rcvaProbe: Probe }).rcvaProbe.screenOf(shipmentId), id)
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await expect.poll(async () => (await at(front.id)) !== null).toBe(true)
  await dragTo(page, (await at(front.id))!, (await at(doors.id))!)
  await expect(problems).toContainText('ne može da izađe: na njoj je')
  expect((await floor(page)).find((p) => p.id === front.id)!.x).toBeGreaterThan(front.x)

  // Saving with a broken rule asks first.
  await save.click()
  await expect(editor.getByRole('alert')).toContainText('Raspored krši pravila')
  await editor.getByRole('button', { name: 'Odustani' }).click()
  await expect(editor.getByRole('alert')).toBeHidden()
  await save.click()
  await editor.getByRole('button', { name: 'Da, sačuvaj' }).click()
  await expect(editor).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Ručno uređen raspored je sačuvan' })).toBeVisible()
  const manual = page.locator('.notice').filter({ hasText: 'Raspored je ručno uređen' })
  await expect(manual).toBeVisible()
  await expect(page.locator('.notice').filter({ hasText: 'Upozorenja rasporeda' })).toContainText('Ručno uređen raspored:')
  await ready(page)

  // Kept after a reload; the editor opens with it.
  await page.reload()
  await ready(page)
  await expect(manual).toBeVisible()
  await page.getByRole('button', { name: 'Uredi', exact: true }).click()
  await expect(problems).toContainText('ne može da izađe')
  // Nothing changed: closes without asking.
  await editor.getByRole('button', { name: 'Otkaži' }).click()
  await expect(editor).toBeHidden()

  // The computed plan again.
  await manual.getByRole('button', { name: 'Vrati izračunat raspored' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Vraćen je izračunat raspored.' })).toBeVisible()
  await expect(manual).toBeHidden()
  await page.getByRole('button', { name: 'Uredi', exact: true }).click()
  expect(await floor(page)).toEqual(start)

  // Changes thrown away after asking.
  await rectOf(page, doors.id).click()
  await page.keyboard.press('ArrowLeft')
  await editor.getByRole('button', { name: 'Otkaži' }).click()
  await expect(editor.getByRole('alert')).toContainText('Odbaciti izmene rasporeda?')
  await editor.getByRole('button', { name: 'Nastavi uređivanje' }).click()
  await expect(save).toBeEnabled()
  await editor.getByRole('button', { name: 'Otkaži' }).click()
  await editor.getByRole('button', { name: 'Da, odbaci' }).click()
  await expect(editor).toBeHidden()
  await expect(manual).toBeHidden()
  expect(errors).toEqual([])
})
