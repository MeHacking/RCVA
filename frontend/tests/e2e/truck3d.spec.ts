import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Tests 8 and 9 from Spec v2, section 10, against the 3D view (Truck3D, three.js) in Chromium
// (WebGL cannot be checked in jsdom). Default mock scenario "small": "Šleper 1" carries 3
// shipments, "Šleper 2" carries 2. The dev server runs StrictMode. The scene is read through
// the canvas's `rcvaProbe` (Truck3dProbe in src/features/truck-3d/Truck3D.tsx).

interface Probe {
  canvases: number
  pieces: number[] | null
  selected: number[] | null
  geometries: number | null
  textures: number | null
  listeners: number
}

interface CanvasProbe {
  memory: { geometries: number; textures: number }
  pieces: () => number[]
  selected: () => number[]
  screenOf: (shipmentId: number) => { x: number; y: number } | null
  truckOnScreen: () => { left: number; right: number; bottom: number; top: number }
  cameraAt: () => [number, number, number]
}

declare global {
  interface Window {
    __activeListeners: () => number
    __previousCanvas?: HTMLCanvasElement & { rcvaProbe?: CanvasProbe }
  }
  interface HTMLCanvasElement {
    rcvaProbe?: CanvasProbe
  }
}

/** Counts listeners that are currently registered on any EventTarget. */
function installListenerCounter() {
  const registered = new WeakMap<EventTarget, Map<string, Set<unknown>>>()
  let active = 0
  const key = (type: string, options?: boolean | EventListenerOptions) =>
    `${type}|${typeof options === 'boolean' ? options : !!options?.capture}`
  const add = EventTarget.prototype.addEventListener
  const remove = EventTarget.prototype.removeEventListener
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (listener) {
      const byType = registered.get(this) ?? new Map<string, Set<unknown>>()
      registered.set(this, byType)
      const listeners = byType.get(key(type, options)) ?? new Set()
      byType.set(key(type, options), listeners)
      if (!listeners.has(listener)) {
        listeners.add(listener)
        active++
      }
    }
    return add.call(this, type, listener, options)
  }
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (listener && registered.get(this)?.get(key(type, options))?.delete(listener)) active--
    return remove.call(this, type, listener, options)
  }
  window.__activeListeners = () => active
}

/** Two frames, so the view has drawn the current scene. */
const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

async function probe(page: Page): Promise<Probe> {
  await frames(page)
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.truck3d canvas')
    const p = canvas?.rcvaProbe
    return {
      canvases: document.querySelectorAll('canvas').length,
      pieces: p ? p.pieces() : null,
      selected: p ? p.selected() : null,
      geometries: p ? p.memory.geometries : null,
      textures: p ? p.memory.textures : null,
      listeners: window.__activeListeners?.() ?? 0,
    }
  })
}

async function openTruck3d(page: Page) {
  await page.goto('/optimization/time')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('navigation').getByRole('link', { name: '3D prikaz kamiona' }).click()
  await showTruck(page, 'Šleper 1', 3)
}

async function showTruck(page: Page, name: string, shipments: number) {
  await page.getByRole('group', { name: 'Izbor kamiona' }).getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: `${name}: ${shipments} pošiljke` })).toBeVisible()
  await expect(page.locator('[data-testid=truck-visualizer][data-state=ready]')).toBeVisible({ timeout: 15_000 })
}

const shipmentButton = (page: Page, id: string) => page.getByRole('button', { name: new RegExp(id) })

/** The whole truck is in the picture and reaches 88 % of it at its widest (fitView). */
async function expectTruckFitted(page: Page, what: string) {
  await frames(page)
  const s = await page.evaluate(() => document.querySelector<HTMLCanvasElement>('.truck3d canvas')!.rcvaProbe!.truckOnScreen())
  expect(Math.max(-s.left, s.right, -s.bottom, s.top), `${what}: ${JSON.stringify(s)}`).toBeCloseTo(0.88, 2)
}

test('test 8: the load plan is drawn with one body per placement, picked in the list or in the view', async ({ page }) => {
  const errors = collectPageErrors(page)
  await openTruck3d(page)

  // Plan order: from the front wall to the doors (S-104 is unloaded first, at the doors).
  expect((await probe(page)).pieces).toEqual([105, 103, 104])
  await expect(page.getByText('Ilustrativni raspored')).toBeVisible()
  await expect(page.getByRole('img', { name: '3D prikaz kamiona: 3 pošiljke u tovarnom prostoru' })).toBeVisible()

  // Chosen in the list: the block is marked, and the line under the view says what it is.
  await shipmentButton(page, 'S-103').click()
  await expect(shipmentButton(page, 'S-103')).toHaveAttribute('aria-pressed', 'true')
  expect((await probe(page)).selected).toEqual([103])
  const info = page.locator('.truck-view__info')
  await expect(info).toContainText('S-103: Kragujevac → Stenkullen, 6,0 LDM, 6000 × 2480 × 2200 mm, 5400 kg, istovar 3.')

  // Chosen in the view: a click on a block picks that shipment in the list as well.
  const at = await page.evaluate(() => document.querySelector<HTMLCanvasElement>('.truck3d canvas')!.rcvaProbe!.screenOf(104))
  expect(at).not.toBeNull()
  await page.mouse.click(at!.x, at!.y)
  await expect(shipmentButton(page, 'S-104')).toHaveAttribute('aria-pressed', 'true')
  await expect(shipmentButton(page, 'S-103')).toHaveAttribute('aria-pressed', 'false')
  expect((await probe(page)).selected).toEqual([104])
  await expect(info).toContainText('S-104')

  // A click beside the truck clears the choice.
  const box = (await page.locator('.truck3d').boundingBox())!
  await page.mouse.click(box.x + 8, box.y + 8)
  await expect(shipmentButton(page, 'S-104')).toHaveAttribute('aria-pressed', 'false')
  expect((await probe(page)).selected).toEqual([])
  await expect(info).toContainText('Prevucite mišem')

  // Each view looks from its own side (cargo space 1360 × 248 × 270 cm: X along, Y up, Z
  // across) and shows the whole truck, filling the picture to 88 % one way or the other.
  const views = page.getByRole('group', { name: 'Pogled' })
  const from: Record<string, (c: [number, number, number]) => boolean> = {
    Odozgo: ([, y, z]) => y > 1000 && Math.abs(z - 124) < 50, // straight above
    'Sa strane': ([, y, z]) => z > 600 && y < 400, // beside the long side
    'Od vrata': ([x]) => x > 1700, // behind the doors
    Ukoso: ([x, y, z]) => x > 550 && y > 270 && z > 248, // above, behind, on the left
  }
  for (const view of ['Odozgo', 'Sa strane', 'Od vrata', 'Ukoso']) {
    await views.getByRole('button', { name: view }).click()
    await expect(views.getByRole('button', { name: view })).toHaveAttribute('aria-pressed', 'true')
    await frames(page)
    const camera = await page.evaluate(() => document.querySelector<HTMLCanvasElement>('.truck3d canvas')!.rcvaProbe!.cameraAt())
    expect(from[view](camera), `${view}: camera at ${camera.map(Math.round).join(', ')}`).toBe(true)
    await expectTruckFitted(page, view)
  }

  await showTruck(page, 'Šleper 2', 2)
  expect((await probe(page)).pieces).toHaveLength(2)
  expect(errors).toEqual([])
})

test('test 9: switching trucks 20 times leaves one canvas and no leaks (StrictMode)', async ({ page }) => {
  test.setTimeout(120_000) // 20 switches, each waits for the mock latency and a new scene
  await page.addInitScript(installListenerCounter)
  await openTruck3d(page)
  const baseline = await probe(page)

  // GPU geometries still held by the view that was just replaced, read after each switch.
  const leftBehind: (number | null)[] = []
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      window.__previousCanvas = document.querySelector<HTMLCanvasElement>('.truck3d canvas') ?? undefined
    })
    if (i % 2 === 0) await showTruck(page, 'Šleper 2', 2)
    else await showTruck(page, 'Šleper 1', 3)
    leftBehind.push(await page.evaluate(() => window.__previousCanvas?.rcvaProbe?.memory.geometries ?? null))
  }
  const after = await probe(page)

  expect.soft(after.canvases, 'canvas elements').toBe(1)
  expect.soft(after.listeners, 'active event listeners vs. baseline').toBe(baseline.listeners)
  expect.soft(baseline.geometries, 'renderer.info.memory must be readable').toBeGreaterThan(0)
  expect.soft(leftBehind, 'geometries left in the previous view after each switch').toEqual(Array(20).fill(0))
  expect.soft(after.geometries, 'GPU geometries vs. baseline (same truck)').toBe(baseline.geometries)
  expect.soft(after.textures, 'GPU textures vs. baseline (same truck)').toBe(baseline.textures)
})

test('test 9b: leaving the screen removes the canvas', async ({ page }) => {
  await openTruck3d(page)
  await expect(page.locator('canvas')).toHaveCount(1)
  await page.getByRole('navigation').getByRole('link', { name: 'Pregled' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Pregled' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('the 3D view goes full screen and back, and fills the page where the browser has no full screen', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.setViewportSize({ width: 1200, height: 800 })
  await openTruck3d(page)
  const button = page.locator('.truck-view__fullscreen')
  const card = page.locator('.truck-view')
  const size = async () => {
    const b = (await card.boundingBox())!
    return [Math.round(b.width), Math.round(b.height)]
  }
  /** The canvas was drawn at the size of its box (the view follows a resize). */
  const canvasFits = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.truck3d canvas')!
      const box = canvas.getBoundingClientRect()
      return Math.abs(canvas.width / devicePixelRatio - box.width) < 2 && Math.abs(canvas.height / devicePixelRatio - box.height) < 2
    })
  const before = await size()

  await button.click()
  await expect(button).toHaveText('Normalan prikaz')
  expect(await page.evaluate(() => document.fullscreenElement?.className)).toContain('truck-view')
  await expect.poll(size).toEqual([1200, 800])
  await expect.poll(canvasFits).toBe(true)
  // The picture changed shape: the camera fitted the truck to it again.
  await expectTruckFitted(page, 'full screen')
  await button.click()
  await expect(button).toHaveText('Ceo ekran')
  await expect.poll(size).toEqual(before)
  await expect.poll(canvasFits).toBe(true)
  await expectTruckFitted(page, 'back from full screen')

  // Without it (some phones): spread over the page, above the bars; Esc closes.
  await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }))
  await button.click()
  await expect(button).toHaveText('Normalan prikaz')
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  await expect.poll(size).toEqual([1200, 800])
  await expect.poll(canvasFits).toBe(true)
  await page.keyboard.press('Escape')
  await expect(button).toHaveText('Ceo ekran')
  await expect.poll(size).toEqual(before)
  expect(errors).toEqual([])
})
