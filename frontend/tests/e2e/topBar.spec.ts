import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Default mock scenario "small": the job goes QUEUED -> RUNNING -> COMPLETED in about 4 s.
test('top bar starts a job and polls it to completion', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  const status = page.getByTestId('last-job-status')
  const button = page.getByRole('banner').getByRole('button', { name: 'Pokreni optimizaciju' })

  await expect(status).toContainText('Nije pokretano')
  await expect(status).toContainText('Optimizacija još nije pokretana.')
  await button.click()
  // While it goes, the button counts the time instead (as in smartLoad+) and cannot start another job.
  const clock = page.getByRole('banner').getByTestId('job-clock')
  await expect(button).toBeHidden()
  await expect(clock.locator('xpath=ancestor::button')).toBeDisabled()
  await expect(status).toContainText(/(U redu čekanja|U toku)Posao #1/)
  await expect(clock).toHaveText(/^Računam… 0:0\d \/ 1:00$/)
  await expect(clock).not.toHaveText(/0:00 \//)
  await expect(status).toContainText('ZavršenoPosao #1', { timeout: 10_000 })
  await expect(status).toContainText('Kamioni: 2')
  await expect(status).toContainText('Validator: prošao')
  await expect(button).toBeEnabled()
  expect(errors).toEqual([])
})
