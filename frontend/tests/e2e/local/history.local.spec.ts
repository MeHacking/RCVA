import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// Istorija (user, 21.11.2026; saving by "Sačuvaj", 22.11.2026): only the optimizations saved at
// the end of the result are kept, by their names (no numbers); "Otvori" shows one on Rezultati,
// Mapa ruta and 3D prikaz instead of the last one; one can be renamed and deleted.

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

/** Runs a job and waits for its result, not saved yet. */
async function runJob(page: Page, seconds: string) {
  await startJob(page, seconds)
  await expect(page.getByRole('main').getByText(/^Poslednja optimizacija · završen/)).toBeVisible({ timeout: 20_000 })
}

/** "Sačuvaj" at the end of the result; a name, or null to keep the usual one. */
async function save(page: Page, name: string | null) {
  const part = page.getByRole('region', { name: 'Čuvanje u istoriji' })
  await part.getByRole('button', { name: 'Sačuvaj' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sačuvano u istoriji' })
  if (name === null) {
    await dialog.getByRole('button', { name: 'Zadrži naziv' }).click()
  } else {
    await dialog.getByLabel('Ime').fill(name)
    await dialog.getByRole('button', { name: 'Sačuvaj ime' }).click()
  }
  await expect(dialog).toHaveCount(0)
  return part
}

const table = (page: Page) => page.getByRole('table', { name: 'Sačuvane optimizacije' })

test('keeps only saved jobs, by name; opens an older one everywhere, renames and deletes one', async ({ page }) => {
  // Two jobs, saving, opening, renaming and deleting: longer than the usual 30 s.
  test.setTimeout(60_000)
  const errors = collectPageErrors(page)
  await runJob(page, '1')
  const part = await save(page, 'Sever')
  await expect(part).toContainText('Sačuvano')
  await expect(part.getByRole('button', { name: 'Sačuvaj' })).toHaveCount(0)
  await expect(page.getByRole('main').getByText(/^Sever · završen/)).toBeVisible()
  await keepLocations(page)
  await runJob(page, '2')

  // Not saved: not in Istorija.
  await page.getByRole('navigation').getByRole('link', { name: 'Istorija' }).click()
  const rows = table(page).getByRole('row')
  await expect(rows).toHaveCount(2) // header + 1
  await expect(rows.nth(1)).toContainText('Sever')
  await expect(rows.nth(1)).toContainText('od 0:01')
  await expect(rows.nth(1)).not.toContainText('#')

  // Saved under its usual name: its trucks and kilometres.
  await page.goto('/optimization/result')
  await save(page, null)
  await expect(page.getByRole('main').getByText(/^\d+ kamiona? - [\d,]+ km · završen/)).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Istorija' }).click()
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(1)).toContainText(/^\d+ kamiona? - [\d,]+ kmprikazan/)
  await expect(rows.nth(2)).toContainText('Sever')

  // Opened: Rezultati and the map show "Sever".
  await page.getByRole('button', { name: 'Otvori: Sever' }).click()
  await expect(page).toHaveURL('/optimization/result')
  await expect(page.getByRole('main').getByText(/^Sever · završen/)).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Prikazana je optimizacija „Sever“ iz Istorije' })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Mapa ruta' }).click()
  await expect(page.getByRole('group', { name: 'Izbor rute' })).toContainText('Sever')

  // Renamed.
  await page.getByRole('navigation').getByRole('link', { name: 'Istorija' }).click()
  await page.getByRole('button', { name: 'Preimenuj: Sever' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo ime' })
  await dialog.getByLabel('Ime').fill('Jug')
  await dialog.getByRole('button', { name: 'Sačuvaj ime' }).click()
  await expect(rows.nth(2)).toContainText('Jugprikazan')

  // Deleted after asking; the shown job is then gone from Rezultati too.
  await page.getByRole('button', { name: 'Obriši: Jug' }).click()
  const confirm = page.getByRole('group', { name: 'Potvrda brisanja: Jug' })
  await confirm.getByRole('button', { name: 'Otkaži' }).click()
  await expect(rows).toHaveCount(3)
  await page.getByRole('button', { name: 'Obriši: Jug' }).click()
  await confirm.getByRole('button', { name: 'Da, obriši' }).click()
  await expect(page.getByRole('status').filter({ hasText: '„Jug“ je obrisana.' })).toBeVisible()
  await expect(rows).toHaveCount(2)
  await page.getByRole('navigation').getByRole('link', { name: 'Pregled' }).click()
  await expect(page.getByText('Optimizacija još nije pokretana.')).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Istorija' }).click()

  // Kept on the device.
  await page.reload()
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1)).toContainText(/kamiona? - /)
  expect(errors).toEqual([])
})

test('cannot open another job while one runs', async ({ page }) => {
  const errors = collectPageErrors(page)
  await runJob(page, '1')
  await save(page, 'Sever')
  await keepLocations(page)
  await startJob(page, '8')
  await expect(page.getByRole('banner').getByTestId('job-clock')).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Istorija' }).click()
  await expect(table(page).getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Otvori: Sever' })).toBeDisabled()
  await expect(page.getByText('Dok optimizacija radi, drugi rezultat se ne može otvoriti.')).toBeVisible()
  expect(errors).toEqual([])
})

// Without collectPageErrors: no listener accepts the question, so it can be answered here.
test('asks before a new job replaces a result not saved, and keeps it when the answer is no', async ({ page }) => {
  await runJob(page, '1')
  await keepLocations(page)
  let asked = ''
  page.once('dialog', (dialog) => {
    asked = dialog.message()
    void dialog.dismiss()
  })
  await startJob(page, '1')
  await expect.poll(() => asked).toBe('Rezultat nije sačuvan u istoriji i biće izgubljen. Nastaviti?')
  // Nothing started: the result not saved is still there.
  await expect(page.getByRole('main').getByText(/^Poslednja optimizacija · završen/)).toBeVisible()
  await expect(page.getByRole('banner').getByTestId('job-clock')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Čuvanje u istoriji' }).getByRole('button', { name: 'Sačuvaj' })).toBeVisible()
})
