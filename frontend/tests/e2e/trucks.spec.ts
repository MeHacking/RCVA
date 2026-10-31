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

test('saves a payload, and shows an empty one as not limited', async ({ page }) => {
  await expect(page.getByRole('row', { name: /Šleper 1/ })).toContainText('bez ograničenja')
  await page.getByRole('button', { name: 'Izmeni Šleper 1' }).click()
  const payload = page.getByLabel('Nosivost (kg)')
  await payload.fill('24 t')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('Unesite pozitivan ceo broj kilograma, npr. 24000.')).toBeVisible()
  await expect(payload).toHaveAttribute('aria-invalid', 'true')

  await payload.fill('24000')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByRole('row', { name: /Šleper 1/ })).toContainText('24000')
})

test('requires all three dimensions or none', async ({ page }) => {
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('X')
  await page.getByLabel('Kapacitet (LDM)').fill('7')
  await page.getByLabel('Dužina').fill('7000')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  await expect(page.getByText('Unesite sve tri dimenzije tovarnog prostora ili nijednu.')).toBeVisible()
})

test('removes a truck after confirming in the row; cancel keeps it', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.getByRole('button', { name: 'Ukloni Solo 1' }).click()
  const confirm = page.getByRole('group', { name: 'Potvrda uklanjanja: Solo 1' })
  await expect(confirm).toContainText('Ukloniti kamion?')
  await confirm.getByRole('button', { name: 'Otkaži' }).click()
  await expect(page.getByRole('row', { name: /Solo 1/ })).toBeVisible()

  await page.getByRole('button', { name: 'Ukloni Solo 1' }).click()
  await page.getByRole('group', { name: 'Potvrda uklanjanja: Solo 1' }).getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('row', { name: /Solo 1/ })).toHaveCount(0)
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(3) // header + 2
  expect(errors).toEqual([])
})

test('closes the edit form when the edited truck is removed', async ({ page }) => {
  await page.getByRole('button', { name: 'Izmeni Šleper 2' }).click()
  await expect(page.getByRole('heading', { name: 'Izmena kamiona #2' })).toBeVisible()
  await page.getByRole('button', { name: 'Ukloni Šleper 2' }).click()
  await page.getByRole('group', { name: 'Potvrda uklanjanja: Šleper 2' }).getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('heading', { name: 'Izmena kamiona #2' })).toBeHidden()
  await expect(page.getByRole('row', { name: /Šleper 2/ })).toHaveCount(0)
})

test('refuses removal while an optimization is running', async ({ page }) => {
  await page.getByRole('banner').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await page.getByRole('button', { name: 'Ukloni Šleper 1' }).click()
  await page.getByRole('group', { name: 'Potvrda uklanjanja: Šleper 1' }).getByRole('button', { name: 'Da, ukloni' }).click()

  await expect(page.getByRole('alert')).toContainText(
    'Kamion „Šleper 1“ nije uklonjen: Optimizacija #1 je u toku; kamion se može ukloniti kada se završi. (HTTP 409)',
  )
  await expect(page.getByRole('row', { name: /Šleper 1/ })).toBeVisible()
})
