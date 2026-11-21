import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// Podešavanja > Izgled: the theme changes the colours at once, stays after a reload, and Višnja
// (the first look of RCVA) has no attribute at all.

const pageColour = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test('changes the theme, keeps it on the device and goes back to Višnja', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/settings')
  const picker = page.getByRole('group', { name: 'Tema' })
  await expect(picker.getByRole('radio')).toHaveCount(5)
  const visnja = picker.getByRole('radio', { name: /^Višnja/ })
  await expect(visnja).toBeChecked()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  const visnjaColour = await pageColour(page)
  expect(visnjaColour).toBe('rgb(243, 231, 211)')

  // Dark: the page, the colour scheme of the fields and the accent change.
  await page.locator('.theme-option--grafit').click()
  await expect(picker.getByRole('radio', { name: /^Grafit/ })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'grafit')
  await expect.poll(() => pageColour(page)).toBe('rgb(38, 43, 52)')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')

  // Kept after a reload, and the other screens have it too.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'grafit')
  await expect(page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: /^Grafit/ })).toBeChecked()
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Pregled' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Pregled' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'grafit')

  // With the keyboard: the arrow keys move the choice.
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Podešavanja' }).click()
  const grafit = page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: /^Grafit/ })
  await grafit.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'suma')

  // Back to Višnja: no attribute, the first colours.
  await page.locator('.theme-option--visnja').click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  await expect.poll(() => pageColour(page)).toBe(visnjaColour)
  await page.reload()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  expect(errors).toEqual([])
})

test('takes quick changes one after another without errors, the last one winning', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/settings')
  await expect(page.getByRole('group', { name: 'Tema' })).toBeVisible()
  // Each change comes while the circle of the one before is still spreading (with the keyboard:
  // while a change lasts the browser gives clicks to <html>, but keys go to the focused choice).
  await page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: /^Višnja/ }).focus()
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(60)
  }
  // Višnja is the last, so the arrow goes round: Teget, Grafit, Šuma.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'suma')
  await expect(page.getByRole('group', { name: 'Tema' }).getByRole('radio', { name: /^Šuma/ })).toBeChecked()
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('theme-switching'))).toBe(false)
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
})

test('prints the result in Višnja whatever the theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rcva.theme', 'neon'))
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon')
  expect(await pageColour(page)).toBe('rgb(28, 28, 30)')
  await page.emulateMedia({ media: 'print' })
  // The tokens fall back to Višnja on paper (the report sets its own white page on top of them).
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim())).toBe(
    '#2b2a2c',
  )
})

test('counts the numbers on the dashboard up to their values', async ({ page }) => {
  await page.goto('/')
  const shipments = page.locator('.stat').filter({ has: page.getByText('Pošiljke', { exact: true }) }).locator('.stat__value')
  // Seen on the way (the count takes most of a second), then the value itself.
  const seen = new Set<string>()
  await expect
    .poll(async () => {
      seen.add((await shipments.textContent()) ?? '')
      return seen.has('5')
    })
    .toBe(true)
  expect([...seen].some((text) => text !== '5')).toBe(true)
  await expect(shipments).toHaveText('5')
})

test('counts nothing with reduced motion: the value at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const ldm = page.locator('.stat').filter({ has: page.getByText('Ukupno LDM', { exact: true }) }).locator('.stat__value')
  await expect(ldm).toHaveText('20,9', { timeout: 200 })
})
