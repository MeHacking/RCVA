import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Runs against the default mock scenario "small" (3 trucks). Mock state lives in memory,
// so every page load starts from the fixture again.

test.beforeEach(async ({ page }) => {
  await page.goto('/trucks')
  await expect(page.getByRole('table')).toBeVisible()
})

test('lists the fixture trucks', async ({ page }) => {
  const rows = page.getByRole('table').getByRole('row')
  await expect(rows).toHaveCount(4) // header + 3
  await expect(rows.nth(1)).toContainText('Šleper 1')
  await expect(rows.nth(1)).toContainText('13,6')
  await expect(rows.nth(1)).toContainText('13600 × 2480 × 2700 mm')
})

test('rejects capacity 0 and keeps the table unchanged', async ({ page }) => {
  await page.getByRole('button', { name: 'Izmeni Šleper 1' }).click()
  const capacity = page.getByLabel('Kapacitet (LDM)')
  await capacity.fill('0')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  await expect(page.getByText('Kapacitet mora biti veći od 0.')).toBeVisible()
  await expect(capacity).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('13,6')
})

test('edits a truck and shows the saved values', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.getByRole('button', { name: 'Izmeni Šleper 2' }).click()
  await page.getByLabel('Naziv').fill('Šleper 2 (novi)')
  await page.getByLabel('Kapacitet (LDM)').fill('12.5')
  await page.getByLabel('Dostupan za optimizaciju').uncheck()
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  await expect(page.getByRole('heading', { name: /Izmena kamiona/ })).toBeHidden()
  const row = page.getByRole('row', { name: /Šleper 2 \(novi\)/ })
  await expect(row).toContainText('12,5')
  await expect(row).toContainText('Ne')
  expect(errors).toEqual([])
})

test('adds a truck without dimensions', async ({ page }) => {
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('Solo 2')
  await page.getByLabel('Kapacitet (LDM)').fill('7')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  const row = page.getByRole('row', { name: /Solo 2/ })
  await expect(row).toContainText('7,0')
  await expect(row).toContainText('nije uneto')
})

test('requires all three dimensions or none', async ({ page }) => {
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('X')
  await page.getByLabel('Kapacitet (LDM)').fill('7')
  await page.getByLabel('Dužina').fill('7000')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  await expect(page.getByText('Unesite sve tri dimenzije tovarnog prostora ili nijednu.')).toBeVisible()
})
