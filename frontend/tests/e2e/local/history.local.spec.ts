import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// Istorija (user, 21.11.2026): the optimizations kept on the device; "Otvori" shows one on
// Rezultati, Mapa ruta and 3D prikaz instead of the last one; a finished one can be deleted.

/** After a job every used truck gets a proposal; the next job would first ask. They stay. */
async function keepLocations(page: Page) {
  await page.goto('/trucks')
  const keep = page.getByRole('button', { name: /^Zadrži sadašnju lokaciju za / })
  await expect(keep.first()).toBeVisible()
  for (let left = await keep.count(); left > 0; left--) {
    await keep.first().click()
    await expect(keep).toHaveCount(left - 1)
  }
}

async function startJob(page: Page, seconds: string) {
  await page.goto('/optimization/time')
  await page.getByLabel('Vremensko ograničenje (s)').fill(seconds)
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).first().click()
}

async function runJob(page: Page, seconds: string, id: number) {
  await startJob(page, seconds)
  await expect(page.getByRole('main').getByText(new RegExp(`^Posao #${id} · završen`))).toBeVisible({ timeout: 20_000 })
}

const table = (page: Page) => page.getByRole('table', { name: 'Sačuvane optimizacije' })

test('lists the kept jobs, opens an older one everywhere, and deletes one', async ({ page }) => {
  const errors = collectPageErrors(page)
  await runJob(page, '1', 1)
  await keepLocations(page)
  await runJob(page, '2', 2)

  await page.getByRole('navigation').getByRole('link', { name: 'Istorija' }).click()
  const rows = table(page).getByRole('row')
  await expect(rows).toHaveCount(3) // header + 2
  // Newest first; the one shown now is marked.
  await expect(rows.nth(1)).toContainText('#2prikazan')
  await expect(rows.nth(1)).toContainText('Završeno')
  await expect(rows.nth(1)).toContainText('od 0:02')
  await expect(rows.nth(2)).toContainText('#1')
  await expect(rows.nth(2)).toContainText('od 0:01')
  await expect(rows.nth(2)).toContainText(/Šleper/)
  await expect(rows.nth(2)).toContainText('km')

  // Opened: Rezultati, the top bar and the map show job #1.
  await page.getByRole('button', { name: 'Otvori posao #1' }).click()
  await expect(page).toHaveURL('/optimization/result')
  await expect(page.getByRole('main').getByText(/^Posao #1 · završen/)).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Prikazan je posao #1 iz Istorije' })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Mapa ruta' }).click()
  await expect(page.getByRole('group', { name: 'Izbor rute' })).toContainText('Posao #1')
  await page.getByRole('navigation').getByRole('link', { name: 'Istorija' }).click()
  await expect(rows.nth(2)).toContainText('#1prikazan')

  // Deleted after asking; the shown job is then gone from Rezultati too.
  await page.getByRole('button', { name: 'Obriši posao #1' }).click()
  const confirm = page.getByRole('group', { name: 'Potvrda brisanja: posao #1' })
  await confirm.getByRole('button', { name: 'Otkaži' }).click()
  await expect(rows).toHaveCount(3)
  await page.getByRole('button', { name: 'Obriši posao #1' }).click()
  await confirm.getByRole('button', { name: 'Da, obriši' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Posao #1 je obrisan.' })).toBeVisible()
  await expect(rows).toHaveCount(2)
  await expect(page.getByTestId('last-job-status')).toContainText('Nije pokretano')

  // Kept on the device: after a reload, still only job #2.
  await page.reload()
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1)).toContainText('#2')
  expect(errors).toEqual([])
})

test('cannot open another job while one runs', async ({ page }) => {
  const errors = collectPageErrors(page)
  await runJob(page, '1', 1)
  await keepLocations(page)
  await startJob(page, '8')
  await expect(page.getByRole('banner').getByTestId('job-clock')).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Istorija' }).click()
  await expect(table(page).getByRole('row')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Otvori posao #1' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Otvori posao #2' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Obriši posao #2' })).toBeDisabled()
  await expect(page.getByText('Dok optimizacija radi, drugi rezultat se ne može otvoriti.')).toBeVisible()
  expect(errors).toEqual([])
})
