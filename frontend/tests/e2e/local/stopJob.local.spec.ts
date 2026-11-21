import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// "Prekini" (as in smartLoad+'s run button, owner 21.11.2026): while a job runs, the button in the
// top bar of Optimizacija stops it, long before its time limit.
test('stops a running job from the top bar', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization/time')
  await page.getByLabel('Vremensko ograničenje (s)').fill('60')
  const banner = page.getByRole('banner')
  await banner.getByRole('button', { name: 'Optimizuj' }).click()
  const stop = banner.getByRole('button', { name: 'Računam. Pritisnite da prekinete.' })
  await expect(banner.getByTestId('job-clock')).toHaveText(/^Računam… 0:0[1-9] \//)
  await stop.hover()
  await expect(stop).toContainText('Prekini')
  await stop.click()
  await expect(banner.getByRole('button', { name: 'Optimizuj' })).toBeVisible({ timeout: 5_000 })
  await expect(banner.getByTestId('job-clock')).toHaveCount(0)
  expect(errors).toEqual([])
})
