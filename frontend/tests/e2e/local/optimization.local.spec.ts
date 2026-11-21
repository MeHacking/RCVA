import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The application on the device (VITE_API_MODE=local) over the "small" scenario: the job
// is really solved by the TS solver in a Web Worker, with open routes and rear loading.
// Which trucks carry what is up to the solver, so only its invariants are checked.

test('solves in the browser and shows open routes, the validator and the 3D plan', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await expect(page.getByText('Na uređaju (probni početni podaci)')).toBeVisible()

  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  const routes = page.getByRole('table', { name: 'Kamioni i rute' })
  await expect(routes).toBeVisible({ timeout: 20_000 })

  const stats = page.locator('.stats')
  await expect(stats).toContainText('Kamioni2')
  await expect(stats).toContainText('jednako donjoj granici po kapacitetu')
  await expect(stats).toContainText('od lokacije kamiona do poslednjeg istovara')
  await expect(page.getByText('Validator: rešenje je prošlo nezavisnu proveru')).toBeVisible()
  await expect(page.getByText('Sve pošiljke su dodeljene kamionima.')).toBeVisible()

  // An open route from where the truck is (the scenario's trucks are at its base), without a return.
  const toggle = routes.getByRole('button', { name: /^Stanice \(\d+\)$/ }).first()
  const count = Number((await toggle.textContent())?.match(/\d+/)?.[0])
  await toggle.click()
  const stops = page.getByRole('list', { name: /^Stanice: / }).getByRole('listitem')
  await expect(stops).toHaveCount(1 + count)
  await expect(stops.first()).toContainText('Polazak')
  await expect(stops.first()).toContainText('Beograd – magacin · lokacija kamiona')
  await expect(stops.nth(1)).toContainText('Preuzimanje')
  await expect(stops.last()).toContainText('Isporuka')

  await page.getByRole('navigation').getByRole('link', { name: '3D prikaz kamiona' }).click()
  await page.getByRole('group', { name: 'Izbor kamiona' }).getByRole('button').first().click()
  await expect(page.locator('[data-testid=truck-visualizer][data-state=ready]')).toBeVisible({ timeout: 15_000 })
  expect(errors).toEqual([])
})

// User, 21.11.2026: the time limit was not kept (the advice of one more truck, on by default,
// solved again for as long); and the time that passed is counted while solving, as in smartLoad+.
test('keeps the whole job to the time limit and counts the time while solving', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('4')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()

  const clock = page.getByRole('banner').getByTestId('job-clock')
  await expect(clock).toHaveText(/^Računam… 0:0[0-4] \/ 0:04$/)
  await expect(clock).toHaveText('Računam… 0:02 / 0:04')
  await expect(page.getByRole('main').getByTestId('job-clock')).toHaveText(/^Računam… 0:0[2-4] \/ 0:04$/)

  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 20_000 })
  await expect(clock).toBeHidden()
  // From the job's own times: started to finished within the limit (and a little for the rest of
  // the job). The last write of a job goes in the background, so it is waited for.
  const took = () => page.evaluate(async () => {
    const request = indexedDB.open('rcva')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const read = db.transaction('app').objectStore('app').get('data')
    const data = await new Promise<{ data: { jobs: Array<{ startedAt: string | null; finishedAt: string | null }> } }>((resolve, reject) => {
      read.onsuccess = () => resolve(read.result)
      read.onerror = () => reject(read.error)
    })
    db.close()
    const job = data.data.jobs[data.data.jobs.length - 1]
    return job.startedAt && job.finishedAt ? Date.parse(job.finishedAt) - Date.parse(job.startedAt) : null
  })
  await expect.poll(took).not.toBeNull()
  const ms = (await took()) as number
  // Before the fix: about 8 s (4 s for the solution and 4 s more for the advice).
  expect(ms).toBeGreaterThanOrEqual(3_500)
  expect(ms).toBeLessThan(5_000)
  expect(errors).toEqual([])
})
