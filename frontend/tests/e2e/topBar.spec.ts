import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Default mock scenario "small": the job goes QUEUED -> RUNNING -> COMPLETED in about 4 s.
test('top bar starts a job and polls it to completion', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  const status = page.getByTestId('last-job-status')
  const button = page.getByRole('button', { name: 'Pokreni optimizaciju' })

  await expect(status).toHaveText('Optimizacija još nije pokretana.')
  await button.click()
  await expect(button).toBeDisabled()
  await expect(status).toContainText(/Posao #1: (u redu čekanja|optimizacija u toku)/)
  await expect(status).toContainText('Posao #1: završeno · kamioni: 2', { timeout: 10_000 })
  await expect(status).toContainText('validator: prošao')
  await expect(button).toBeEnabled()
  expect(errors).toEqual([])
})
