import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// Moving shipments between the trucks of a result by hand, in the application on the device
// over the "small" scenario. Which truck carries what is up to the solver, so the test takes
// the first truck's first shipment, whatever it is.

test('takes a shipment off a truck, puts it back, and gives the optimizer\'s result back', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  const routes = page.getByRole('table', { name: 'Kamioni i rute' })
  await expect(routes).toBeVisible({ timeout: 20_000 })
  const unassigned = page.getByRole('table', { name: 'Nedodeljene pošiljke' })
  const manual = page.getByRole('status').filter({ hasText: 'Raspored je ručno izmenjen' })
  await expect(manual).toHaveCount(0)

  // The first truck's shipments, in their window: off the truck goes the first one.
  const truck = (await routes.locator('tbody th[scope="row"]').first().textContent())!
  await routes.getByRole('button', { name: new RegExp(`^\\d+ pošilj\\S*: ${truck}$`) }).click()
  const dialog = page.getByRole('dialog')
  const firstShipment = (await dialog.locator('tbody th[scope="row"]').first().textContent())!
  const move = dialog.getByRole('combobox', { name: `Premesti ${firstShipment}` })
  await expect(move.locator('option', { hasText: 'Izbaci iz kamiona' })).toHaveCount(1)
  await move.selectOption({ label: 'Izbaci iz kamiona' })
  await expect(dialog.getByRole('row', { name: new RegExp(`^${firstShipment} `) })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await expect(manual).toBeVisible()
  await expect(manual).toContainText('u odnosu na predlog optimizacije')
  await expect(unassigned.getByRole('row', { name: new RegExp(`^${firstShipment} `) })).toBeVisible()
  // The shortage of trucks is not what happened here.
  await expect(page.getByText(/^Nema dovoljno kamiona/)).toHaveCount(0)

  // Kept on the device.
  await page.reload()
  await expect(manual).toBeVisible({ timeout: 20_000 })

  // Back onto the truck it came from (it fit there), from the unassigned list.
  await unassigned.getByRole('combobox', { name: `Dodaj ${firstShipment} u kamion` }).selectOption({ label: truck })
  await expect(page.getByText('Sve pošiljke su dodeljene kamionima.')).toBeVisible()
  await expect(page.getByText('Validator: rešenje je prošlo nezavisnu proveru')).toBeVisible()

  // And the optimizer's result again.
  await manual.getByRole('button', { name: 'Vrati predlog optimizacije' }).click()
  await expect(manual).toHaveCount(0)
  expect(errors).toEqual([])
})
