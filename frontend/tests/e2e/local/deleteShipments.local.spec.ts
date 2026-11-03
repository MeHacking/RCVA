import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// "Ukloni sve pošiljke" for a new week, in the application on the device over "small" (5 shipments).

test('removes all shipments only after a confirmation, and keeps that after a reload', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/shipments')
  const rows = page.getByRole('table', { name: 'Pošiljke' }).getByRole('row')
  await expect(rows).toHaveCount(6) // header + 5

  await page.getByRole('button', { name: 'Ukloni sve pošiljke' }).click()
  const confirm = page.getByRole('status').filter({ hasText: 'Ukloniti sve pošiljke (5)?' })
  await expect(confirm).toContainText('Kamioni, poslednji rezultati i zapamćene koordinate i kilometraže ostaju')
  await expect(confirm.getByRole('link', { name: 'izvezite u Podešavanjima' })).toHaveAttribute('href', '/settings')
  await confirm.getByRole('button', { name: 'Otkaži' }).click()
  await expect(confirm).toBeHidden()
  await expect(rows).toHaveCount(6)

  await page.getByRole('button', { name: 'Ukloni sve pošiljke' }).click()
  await confirm.getByRole('button', { name: 'Da, ukloni sve' }).click()
  await expect(page.getByText('Nema unetih pošiljki')).toBeVisible()
  await expect(confirm).toBeHidden()

  await page.reload()
  await expect(page.getByText('Nema unetih pošiljki')).toBeVisible()
  await page.goto('/trucks')
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: /Šleper 1/ })).toBeVisible()
  expect(errors).toEqual([])
})
