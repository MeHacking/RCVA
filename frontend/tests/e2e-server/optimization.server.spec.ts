import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../e2e/consoleGuard.ts'

// Optimization with the real solver (Timefold) on the backend's sample data: Šleper 1 and 2
// available (13,6 LDM each), 5 shipments, 20,9 LDM, so at least 2 trucks. Which shipment
// goes on which truck is up to the solver, so the tests check what does not depend on it.
// This file runs before shipmentImport.server.spec.ts, which adds shipments without
// coordinates (the server then refuses to optimize with 409).

test('runs a job on the server: 2 trucks, validator passed, nothing unassigned', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()

  const routes = page.getByRole('table', { name: 'Kamioni i rute' })
  await expect(routes).toBeVisible({ timeout: 20_000 })
  const stats = page.locator('.stats')
  await expect(stats).toContainText('Kamioni2')
  await expect(stats).toContainText('jednako donjoj granici po kapacitetu')
  await expect(stats).toContainText(/0hard\/-2medium\/-\d+soft/)
  await expect(page.getByText('Validator: rešenje je prošlo nezavisnu proveru')).toBeVisible()
  await expect(page.getByText('Sve pošiljke su dodeljene kamionima.')).toBeVisible()
  await expect(routes.locator('tbody > tr')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('test 8 on a solver result: one 3D body per shipment on the truck', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('1')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 20_000 })

  await page.getByRole('navigation').getByRole('link', { name: '3D prikaz kamiona' }).click()
  for (const name of ['Šleper 1', 'Šleper 2']) {
    await page.getByRole('group', { name: 'Izbor kamiona' }).getByRole('button', { name }).click()
    const heading = page.getByRole('heading', { name: new RegExp(`^${name}: \\d+ pošilj`) })
    await expect(heading).toBeVisible()
    const shipments = Number((await heading.textContent())?.match(/: (\d+) /)?.[1])
    await expect(page.locator('[data-testid=truck-visualizer][data-state=ready]')).toBeVisible({ timeout: 15_000 })

    const bodies = await page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const tego = (window as unknown as { PackWidget: { prototype: { widgetRenderer: { widgets: { itemMap: Map<unknown, unknown> }[] } } } }).PackWidget
      return tego.prototype.widgetRenderer.widgets.at(-1)?.itemMap.size
    })
    expect(shipments).toBeGreaterThan(0)
    expect(bodies).toBe(shipments)
  }
  await expect(page.getByText('Ilustrativni raspored')).toBeVisible()
  expect(errors).toEqual([])
})
