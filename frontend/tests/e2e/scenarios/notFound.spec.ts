import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// Mock scenario "notFound": 3 x 7,0 LDM on 2 x 13,6 LDM -> job ends INFEASIBLE / NOT_FOUND.

test('NOT_FOUND shows the required wording, distinct from PROVEN', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()

  const notice = page.getByRole('main').getByRole('status').filter({ hasText: 'rešenje nije nađeno' })
  await expect(notice).toBeVisible({ timeout: 10_000 })
  await expect(notice).toContainText(
    'Solver nije našao rešenje u zadatom vremenu. To ne znači da rešenje ne postoji.',
  )
  await expect(notice).toContainText('Donja granica broja kamiona po kapacitetu: 2.')
  await expect(page.getByText(/Dokazano neizvodljivo/)).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toHaveCount(0)
  expect(errors).toEqual([])
})
