import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// Mock scenario "proven": one 14,0 LDM shipment, largest truck 13,6 LDM -> 422, no job.

test('PROVEN shows the 422 reason and does not create a job', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()

  const notice = page.getByRole('alert').filter({ hasText: 'Dokazano neizvodljivo (HTTP 422)' })
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Solver nije pokrenut.')
  await expect(notice.getByRole('listitem')).toHaveText([
    'Pošiljka S-401 (14,0 LDM) je veća od najvećeg kamiona (13,6 LDM).',
  ])
  // Must not be confused with NOT_FOUND
  await expect(page.getByText('To ne znači da rešenje ne postoji.')).toHaveCount(0)
  await expect(page.getByText(/Posao #/)).toHaveCount(0)
  expect(errors).toEqual([])
})
