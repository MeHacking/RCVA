import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

const ROUTES = [
  { path: '/', heading: 'Pregled' },
  { path: '/shipments', heading: 'Pošiljke' },
  { path: '/trucks', heading: 'Kamioni' },
  { path: '/optimization', heading: 'Rezultati optimizacije' },
  { path: '/truck-3d', heading: '3D prikaz kamiona' },
  { path: '/route-map', heading: 'Mapa ruta' },
]

for (const route of ROUTES) {
  test(`${route.path} opens without console errors`, async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto(route.path)

    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Glavna navigacija' })).toBeVisible()
    await expect(page.getByRole('banner').getByRole('button', { name: 'Pokreni optimizaciju' })).toBeVisible()
    // Let mount effects (run twice under StrictMode) and mock responses settle.
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    expect(errors).toEqual([])
  })
}

test('navigation links reach all six screens', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Glavna navigacija' })

  for (const route of [...ROUTES.slice(1), ROUTES[0]]) {
    await nav.getByRole('link', { name: route.heading }).click()
    await expect(page).toHaveURL(route.path)
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('unknown path shows a not-found message', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByText('Stranica ne postoji')).toBeVisible()
})
