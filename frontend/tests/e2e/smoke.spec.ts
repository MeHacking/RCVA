import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// The screens of the menu; Optimizacija opens its first step.
const ROUTES = [
  { path: '/', heading: 'Pregled', link: 'Pregled' },
  { path: '/optimization/shipments', heading: 'Pošiljke', link: 'Optimizacija' },
  { path: '/history', heading: 'Istorija', link: 'Istorija' },
  { path: '/trucks', heading: 'Kamioni', link: 'Kamioni' },
  { path: '/help', heading: 'Uputstvo', link: 'Uputstvo' },
]

// And the steps of Optimizacija with the views of its result.
const STEP_ROUTES = [
  { path: '/optimization/shipments/import', heading: 'Uvoz pošiljki iz Excel-a' },
  { path: '/optimization/trucks', heading: 'Lokacije kamiona' },
  { path: '/optimization/time', heading: 'Vremensko ograničenje' },
  { path: '/optimization/result', heading: 'Rezultat' },
  { path: '/optimization/result/map', heading: 'Rezultat' },
  { path: '/optimization/result/3d', heading: 'Rezultat' },
]

for (const route of [...ROUTES, ...STEP_ROUTES]) {
  test(`${route.path} opens without console errors`, async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto(route.path)

    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Glavna navigacija' })).toBeVisible()
    // The top bar: the screen's title, or in Optimizacija its steps and "Optimizuj" (as in smartLoad+).
    const banner = page.getByRole('banner')
    await expect(banner.getByRole('heading', { level: 1 }).or(banner.getByRole('button', { name: 'Optimizuj' }))).toBeVisible()
    // Let mount effects (run twice under StrictMode) and mock responses settle.
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    expect(errors).toEqual([])
  })
}

test('navigation links reach every screen', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Glavna navigacija' })
  await expect(nav.getByRole('link')).toHaveText(['Pregled', 'Optimizacija', 'Istorija', 'Kamioni', 'Uputstvo'])

  for (const route of [...ROUTES.slice(1), ROUTES[0]]) {
    await nav.getByRole('link', { name: route.link }).click()
    await expect(page).toHaveURL(route.path)
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('unknown path shows a not-found message', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByText('Stranica ne postoji')).toBeVisible()
})

test('shows the logo in the sidebar and has it as the favicon', async ({ page, request }) => {
  await page.goto('/')
  const logo = page.getByRole('navigation', { name: 'Glavna navigacija' }).locator('img.brand__logo')
  await expect(logo).toHaveAttribute('src', '/logo.png')
  // Loaded, not a broken image.
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(256)
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', '/favicon.ico')
  const favicon = await request.get('/favicon.ico')
  expect(favicon.status()).toBe(200)
  // An .ico file: reserved 0, type 1 (icon), three images.
  expect([...(await favicon.body()).subarray(0, 6)]).toEqual([0, 0, 1, 0, 3, 0])
})

test('the guide leaves out what only the application on the device has', async ({ page }) => {
  await page.goto('/help')
  await expect(page.getByText('Aplikacija sada ne radi na uređaju')).toBeVisible()
  // The step "Lokacije kamiona" is named (the mock has it too), but not what only the device asks.
  await expect(page.getByRole('region', { name: 'Kako se koristi, korak po korak' })).not.toContainText('mora imati lokaciju')
  await expect(page.getByRole('heading', { name: 'Preporuka dodatnog kamiona' })).toHaveCount(0)
  // Without the two device-only parts the numbers still follow on: the last one is 3.
  const algorithm = page.getByRole('region', { name: 'Kako radi optimizacija' })
  await expect(algorithm.getByRole('heading', { level: 3 })).toHaveText([/^1\.?\s*Pravila/, /^2\.?\s*Koraci/, /^3\.?\s*Šta optimizacija/])
})
