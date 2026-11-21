import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// The top bar as in smartLoad+ (owner, 21.11.2026). Default mock scenario "small": the job goes
// QUEUED -> RUNNING -> COMPLETED in about 4 s.
test('each screen puts its title, what it is for and its buttons into the top bar', async ({ page }) => {
  const errors = collectPageErrors(page)
  const banner = page.getByRole('banner')
  await page.goto('/')
  await expect(banner.getByRole('heading', { level: 1, name: 'Pregled' })).toBeVisible()
  await expect(banner).toContainText('Pošiljke, kamioni i optimizacije')
  await expect(page.getByTestId('last-job-status')).toHaveCount(0)
  await expect(banner.getByRole('button', { name: 'Optimizuj' })).toHaveCount(0)
  await banner.getByRole('button', { name: 'Nastavi optimizaciju' }).click()
  await expect(page).toHaveURL(/\/optimization\//)

  // Kamioni: the search and both "Dodaj" buttons in the bar; the list follows the search.
  await page.goto('/trucks')
  const search = banner.getByRole('searchbox', { name: 'Pretraga kamiona' })
  await expect(banner.getByRole('button', { name: 'Dodaj kamion' })).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Dodaj tip kamiona' })).toBeVisible()
  const rows = page.getByRole('table', { name: 'Kamioni' }).locator('tbody tr')
  await expect(rows).toHaveCount(3)
  await search.fill('solo')
  await expect(rows).toHaveCount(1)
  await search.fill('nema takvog')
  await expect(page.getByText('Nijedan kamion ne odgovara pretrazi „nema takvog“.')).toBeVisible()
  await banner.getByRole('button', { name: 'Obriši' }).click()
  await expect(rows).toHaveCount(3)
  expect(errors).toEqual([])
})

test('Optimizuj starts a job, counts the time and polls it to completion', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization/shipments')
  const button = page.getByRole('banner').getByRole('button', { name: 'Optimizuj' })
  await button.click()
  // While it goes, the button counts the time instead; the mock cannot stop a job, so no "Prekini".
  const clock = page.getByRole('banner').getByTestId('job-clock')
  await expect(button).toBeHidden()
  await expect(clock.locator('xpath=ancestor::button')).toBeDisabled()
  await expect(clock).toHaveText(/^Računam… 0:0\d \/ 1:00$/)
  await expect(clock).not.toHaveText(/0:00 \//)
  // It ends on another screen, so it comes as a notification.
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Pregled' }).click()
  const bell = page.getByRole('button', { name: /^Obaveštenja/ })
  await expect(bell).toHaveAccessibleName('Obaveštenja (1 novo)', { timeout: 10_000 })
  await bell.click()
  await expect(page.getByRole('dialog', { name: 'Obaveštenja' })).toContainText(/Posao #1: kamioni 2, /)
  expect(errors).toEqual([])
})

test('Nova optimizacija in the menu opens the first step of Optimizacija', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/trucks')
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('button', { name: 'Nova optimizacija' }).click()
  await expect(page).toHaveURL(/\/optimization\/shipments$/)
  await expect(page.getByText('Korak 1 od 4')).toBeVisible()
  expect(errors).toEqual([])
})
