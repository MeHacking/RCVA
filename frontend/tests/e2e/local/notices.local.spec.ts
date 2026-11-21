import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The bell and the user at the right end of the top bar (as in smartLoad+): an optimization that
// ends while another screen is open leaves a notification; opening Rezultati clears it.

test('a job that ends on another screen leaves a notification that leads to the results', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization/time')
  const bell = page.getByRole('button', { name: /^Obaveštenja/ })
  await expect(bell).toHaveAccessibleName('Obaveštenja')
  // Closed popups are not in the page for screen readers (nor for getByRole).
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Ends here, on Rezultati: no notification.
  await page.getByLabel('Vremensko ograničenje (s)').fill('1')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 20_000 })
  await expect(bell).toHaveAccessibleName('Obaveštenja')

  // Ends on Kamioni: one notification. (The first job proposed new truck locations: the start
  // goes to the step "Lokacije kamiona", where they are kept.)
  await page.getByRole('link', { name: 'Nazad: vreme' }).click()
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page).toHaveURL('/optimization/trucks')
  await page.getByRole('button', { name: 'Zadrži sve sadašnje lokacije' }).click()
  await page.getByRole('region', { name: 'Gde su kamioni?' }).getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Kamioni', exact: true }).click()
  await expect(page).toHaveURL(/\/trucks$/)
  await expect(bell).toHaveAccessibleName('Obaveštenja (1 novo)', { timeout: 20_000 })
  await bell.click()
  const popup = page.getByRole('dialog', { name: 'Obaveštenja' })
  await expect(popup).toBeVisible()
  await expect(popup).toContainText('Optimizacija je završena')
  await expect(popup).toContainText(/Posao #\d+: kamioni \d+, [\d.,]+ km/)
  await popup.getByRole('button', { name: /Optimizacija je završena/ }).click()
  await expect(page).toHaveURL(/\/optimization\/result$/)
  await expect(bell).toHaveAccessibleName('Obaveštenja')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // A job that had ended before the page was opened is not news.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pregled', level: 1 })).toBeVisible()
  await expect(page.getByRole('main')).toContainText(/Posao #\d+/, { timeout: 20_000 })
  await expect(bell).toHaveAccessibleName('Obaveštenja')
  expect(errors).toEqual([])
})

test('the user popup says nobody is signed in and leads to the settings; Escape closes it', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Korisnik' }).click()
  const popup = page.getByRole('dialog', { name: 'Korisnik' })
  await expect(popup).toContainText('Niste prijavljeni')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Korisnik' }).click()
  await popup.getByRole('button', { name: 'Podešavanja' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})
