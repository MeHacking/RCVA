import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../e2e/consoleGuard.ts'

// Frontend in VITE_API_MODE=server against the Spring Boot backend (in-memory data that
// starts with the same sample trucks as the mock). Tests run in order and share that data.

test('trucks come from the server and the sidebar says so', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/trucks')
  await expect(page.getByTestId('data-source')).toHaveText('Podaci: server')
  const rows = page.getByRole('table').getByRole('row')
  await expect(rows).toHaveCount(4) // header + 3 sample trucks
  await expect(rows.nth(1)).toContainText('Šleper 1')
  expect(errors).toEqual([])
})

test('a truck added in the UI is stored on the server (survives a reload)', async ({ page }) => {
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('Server kamion')
  await page.getByLabel('Kapacitet (LDM)').fill('8,5')
  // The backend does not store a payload, so the form does not ask for one.
  await expect(page.getByLabel('Nosivost (kg)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByRole('row', { name: /Server kamion/ })).toContainText('8,5')

  await page.reload()
  await expect(page.getByRole('row', { name: /Server kamion/ })).toContainText('8,5')
})

// Server-side validation is covered by backend/ApiContractTest: the form checks the same
// rules before sending, so the UI cannot reach it.
test('a changed truck is stored on the server', async ({ page }) => {
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Izmeni Šleper 1' }).click()
  await page.getByLabel('Kapacitet (LDM)').fill('13,0')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await page.reload()
  await expect(page.getByRole('row', { name: /Šleper 1/ })).toContainText('13,0')
})

test('a removed truck stays removed after a reload', async ({ page }) => {
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Ukloni Server kamion' }).click()
  await page.getByRole('group', { name: 'Potvrda uklanjanja: Server kamion' }).getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('row', { name: /Server kamion/ })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('row', { name: /Server kamion/ })).toHaveCount(0)
})
