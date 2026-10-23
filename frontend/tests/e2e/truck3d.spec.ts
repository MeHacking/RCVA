import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Tests 8 and 9 from Spec v2, section 10, against the real TeGo scripts in Chromium
// (WebGL cannot be checked in jsdom). Default mock scenario "small":
// "Šleper 1" carries 3 shipments, "Šleper 2" carries 2. The dev server runs StrictMode.

interface TegoProbe {
  canvases: number
  widgets: number | null
  bodies: number | null
  geometries: number | null
  textures: number | null
  listeners: number
}

declare global {
  interface Window {
    __activeListeners: () => number
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

async function probe(page: Page): Promise<TegoProbe> {
  // Two frames, so the render loop has drawn the current scene.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  return page.evaluate(() => {
    type Renderer = { info: { memory: { geometries: number; textures: number } } }
    const tego = (window as unknown as { PackWidget?: { prototype: { widgetRenderer?: { widgets: { itemMap: Map<unknown, unknown> }[]; renderer?: Renderer } } } }).PackWidget
    const shared = tego?.prototype.widgetRenderer
    const memory = shared?.renderer?.info.memory
    return {
      canvases: document.querySelectorAll('canvas').length,
      widgets: shared ? shared.widgets.length : null,
      bodies: shared?.widgets.at(-1)?.itemMap.size ?? null,
      geometries: memory?.geometries ?? null,
      textures: memory?.textures ?? null,
      listeners: window.__activeListeners(),
    }
  })
}

async function openTruck3d(page: Page) {
  await page.goto('/optimization')
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

test('test 8: the load plan is drawn with one body per placement, selection and mode label', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.addInitScript(installListenerCounter)
  await openTruck3d(page)

  expect((await probe(page)).bodies).toBe(3)
  await expect(page.getByText('Ilustrativni raspored')).toBeVisible()

  // Selecting in the list highlights that body in the scene.
  await page.getByRole('button', { name: /S-103/ }).click()
  await expect(page.getByRole('button', { name: /S-103/ })).toHaveAttribute('aria-pressed', 'true')
  const highlighted = await page.evaluate(() => {
    const tego = (window as unknown as { PackWidget: { prototype: { widgetRenderer: { widgets: { itemMap: Map<unknown, { dataItem: { shipmentId: number }; graphicsItem: { material: { color: { getHex(): number } } } }> }[] } } } }).PackWidget
    const widget = tego.prototype.widgetRenderer.widgets.at(-1)!
    return [...widget.itemMap.values()].map((i) => [i.dataItem.shipmentId, i.graphicsItem.material.color.getHex()])
  })
  expect(highlighted.filter(([, color]) => color === 0x5e1a2e).map(([id]) => id)).toEqual([103])

  await showTruck(page, 'Šleper 2', 2)
  expect((await probe(page)).bodies).toBe(2)
  expect(errors).toEqual([])
})

test('test 9: switching trucks 20 times leaves one canvas and no leaks (StrictMode)', async ({ page }) => {
  test.setTimeout(120_000) // 20 switches, each waits for the mock latency and a new scene
  await page.addInitScript(installListenerCounter)
  await openTruck3d(page)
  const baseline = await probe(page)

  // GPU memory still held by the renderer of the previous view, read after each switch.
  const leftBehind: (number | null)[] = []
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      const shared = (window as unknown as { PackWidget: { prototype: { widgetRenderer?: { renderer?: unknown } } } })
        .PackWidget.prototype.widgetRenderer
      ;(window as unknown as { __previousRenderer?: unknown }).__previousRenderer = shared?.renderer
    })
    if (i % 2 === 0) await showTruck(page, 'Šleper 2', 2)
    else await showTruck(page, 'Šleper 1', 3)
    leftBehind.push(
      await page.evaluate(() => {
        const previous = (window as unknown as { __previousRenderer?: { info: { memory: { geometries: number } } } })
          .__previousRenderer
        return previous ? previous.info.memory.geometries : null
      }),
    )
  }
  const after = await probe(page)

  expect.soft(after.canvases, 'canvas elements').toBe(1)
  expect.soft(after.widgets, 'widgets kept by the shared renderer').toBe(1)
  expect.soft(after.listeners, 'active event listeners vs. baseline').toBe(baseline.listeners)
  expect.soft(baseline.geometries, 'renderer.info.memory must be readable').not.toBeNull()
  expect.soft(leftBehind, 'geometries left in the previous view after each switch').toEqual(Array(20).fill(0))
  expect.soft(after.geometries, 'GPU geometries vs. baseline (same truck)').toBe(baseline.geometries)
  expect.soft(after.textures, 'GPU textures vs. baseline (same truck)').toBe(baseline.textures)
})

test('test 9b: leaving the screen removes the shared canvas', async ({ page }) => {
  await openTruck3d(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Pregled' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Pregled' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
})
