import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Default mock scenario "small": the job goes QUEUED -> RUNNING -> COMPLETED in about 4 s.
test('top bar starts a job and polls it to completion', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  const button = page.getByRole('banner').getByRole('button', { name: 'Pokreni optimizaciju' })

  // The screen's title is in the top bar, as in smartLoad+; the last job's chips are gone.
  await expect(page.getByRole('banner').getByRole('heading', { level: 1, name: 'Pregled' })).toBeVisible()
  await expect(page.getByTestId('last-job-status')).toHaveCount(0)
  await button.click()
  // While it goes, the button counts the time instead (as in smartLoad+) and cannot start another job.
  const clock = page.getByRole('banner').getByTestId('job-clock')
  await expect(button).toBeHidden()
  await expect(clock.locator('xpath=ancestor::button')).toBeDisabled()
  await expect(clock).toHaveText(/^Računam… 0:0\d \/ 1:00$/)
  await expect(clock).not.toHaveText(/0:00 \//)
  // The end comes as a notification (this is not Rezultati).
  await expect(button).toBeEnabled({ timeout: 10_000 })
  const bell = page.getByRole('button', { name: /^Obaveštenja/ })
  await expect(bell).toHaveAccessibleName('Obaveštenja (1 novo)')
  await bell.click()
  await expect(page.getByRole('dialog', { name: 'Obaveštenja' })).toContainText(/Posao #1: kamioni 2, /)
  expect(errors).toEqual([])
})
