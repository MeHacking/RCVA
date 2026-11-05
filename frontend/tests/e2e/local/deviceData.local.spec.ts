import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { collectPageErrors } from '../consoleGuard.ts'

// Export and import of all data on the device (Podešavanja). Every test gets a new browser
// context, so it starts from the scenario "small" (3 trucks).

async function addTruck(page: Page, name: string) {
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill(name)
  await page.getByLabel('Kapacitet (LDM)').fill('13.6')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: new RegExp(name) })).toBeVisible()
  // Where it is, so a job can use it: Subotica is a place the device knows (no lookup).
  await page.getByRole('button', { name: `Unesi lokaciju za ${name}` }).click()
  await page.getByRole('form', { name: `Lokacija kamiona ${name}` }).getByLabel('Mesto').fill('Subotica')
  await page.getByRole('button', { name: 'Sačuvaj lokaciju' }).click()
  await expect(page.getByRole('table', { name: 'Lokacije kamiona' }).getByRole('row').filter({ has: page.getByRole('cell', { name: name, exact: true }) })).toContainText(
    'Subotica',
  )
}

async function saveKey(page: Page, key: string) {
  await page.goto('/settings')
  await page.getByLabel('Ključ za OpenRouteService').fill(key)
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('Podešavanja su sačuvana.')).toBeVisible()
}

async function exportFile(page: Page): Promise<{ name: string; content: string }> {
  await page.goto('/settings')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Izvezi podatke' }).click(),
  ])
  await expect(page.getByText(`Napravljen je fajl ${download.suggestedFilename()}.`)).toBeVisible()
  return { name: download.suggestedFilename(), content: await readFile((await download.path()) as string, 'utf-8') }
}

const choose = (page: Page, name: string, content: string) =>
  page.getByLabel('Fajl sa podacima').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) })

test('exports one file with the data and without the ORS key', async ({ page }) => {
  const errors = collectPageErrors(page)
  await addTruck(page, 'Izvozna cerada')
  await saveKey(page, 'tajni-kljuc-123')
  const file = await exportFile(page)

  expect(file.name).toMatch(/^rcva-\d{4}-\d{2}-\d{2}\.json$/)
  expect(file.content).not.toContain('tajni-kljuc-123')
  const data = JSON.parse(file.content) as { format: string; version: number; data: { trucks: { name: string }[] } }
  expect([data.format, data.version]).toEqual(['rcva-podaci', 1])
  expect(data.data.trucks.map((t) => t.name)).toContain('Izvozna cerada')
  expect(errors).toEqual([])
})

test('imports a file only after showing what it holds, and keeps the key of the device', async ({ page }) => {
  const errors = collectPageErrors(page)
  await addTruck(page, 'Izvozna cerada')
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('2')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 20_000 })
  const file = await exportFile(page)

  // The device moves on: the truck is gone, and a key is set after the export.
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Ukloni Izvozna cerada' }).click()
  await page.getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: /Izvozna cerada/ })).toBeHidden()
  await saveKey(page, 'kljuc-ovog-uredjaja')

  await choose(page, file.name, file.content)
  const review = page.getByRole('status').filter({ hasText: 'Uvoz zamenjuje sve podatke na uređaju' })
  await expect(review.getByRole('list', { name: 'Sadržaj fajla' })).toContainText('kamioni: 4')
  await expect(review).toContainText('rezultati optimizacije: 1')
  // Cancelling changes nothing.
  await review.getByRole('button', { name: 'Odustani' }).click()
  await expect(review).toBeHidden()

  await choose(page, file.name, file.content)
  await review.getByRole('button', { name: 'Zameni podatke' }).click()
  await expect(page.getByText(`Podaci su uvezeni iz fajla ${file.name}`)).toBeVisible()
  await expect(page.getByLabel('Ključ za OpenRouteService')).toHaveValue('kljuc-ovog-uredjaja')

  await page.goto('/trucks')
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: /Izvozna cerada/ })).toBeVisible()
  await page.goto('/optimization')
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible()
  expect(errors).toEqual([])
})

test('refuses a bad file and changes nothing', async ({ page }) => {
  await addTruck(page, 'Ostaje cerada')
  await page.goto('/settings')
  await choose(page, 'pogresan.json', '{"format":"rcva-podaci","version":7}')
  await expect(page.getByRole('alert')).toHaveText(
    'Fajl nije uvezen: Fajl je u formatu 7, a aplikacija zna samo format 1; možda ga je napravila novija verzija aplikacije. (HTTP 400) Podaci na uređaju nisu menjani.',
  )
  await expect(page.getByRole('button', { name: 'Zameni podatke' })).toHaveCount(0)
  await page.goto('/trucks')
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: /Ostaje cerada/ })).toBeVisible()
})

test('the settings never scroll sideways, and the data buttons sit in the bottom right corner', async ({ page }) => {
  const errors = collectPageErrors(page)
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: 'Izvezi podatke' })).toBeVisible()
    // The cards rise in when the screen opens: measure once they stand still.
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
    // The hidden file field once kept the width of a field and widened the page by 470 px.
    const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(scrollWidth, `width ${width}`).toBeLessThanOrEqual(clientWidth)

    const card = (await page.locator('.device-data').boundingBox())!
    const buttons = (await page.locator('.data-actions').boundingBox())!
    const padding = await page.locator('.device-data').evaluate((e) => parseFloat(getComputedStyle(e).paddingRight))
    expect(Math.round(card.x + card.width - padding - (buttons.x + buttons.width)), `right, width ${width}`).toBeLessThanOrEqual(1)
    const bottomPadding = await page.locator('.device-data').evaluate((e) => parseFloat(getComputedStyle(e).paddingBottom))
    expect(Math.round(card.y + card.height - bottomPadding - (buttons.y + buttons.height)), `bottom, width ${width}`).toBeLessThanOrEqual(1)
  }
  expect(errors).toEqual([])
})

test('erases all data only with the administrator password', async ({ page }) => {
  const errors = collectPageErrors(page)
  await addTruck(page, 'Proba brisanja')
  await saveKey(page, 'tajni-kljuc-123')
  const reset = page.getByRole('form', { name: 'Brisanje svih podataka' })
  const password = reset.getByLabel('Administratorska lozinka')
  const button = reset.getByRole('button', { name: 'Obriši sve podatke' })
  await expect(button).toBeDisabled()

  // A wrong password removes nothing.
  await password.fill('pogresno')
  await button.click()
  await expect(reset.getByText('Pogrešna lozinka. Ništa nije obrisano.')).toBeVisible()
  await expect(page.getByLabel('Ključ za OpenRouteService')).toHaveValue('tajni-kljuc-123')

  // The right one: everything goes, then the page starts again (here from the scenario "small").
  await password.fill('adminconfirm')
  await button.click()
  await expect(page.getByText('Svi podaci na uređaju su obrisani; aplikacija je kao pri prvom pokretanju.')).toBeVisible()
  await expect(page.getByLabel('Ključ za OpenRouteService')).toHaveValue('')
  await page.goto('/trucks')
  const trucks = page.getByRole('table', { name: 'Kamioni' })
  await expect(trucks.getByRole('row')).toHaveCount(4) // header + the scenario's 3
  await expect(trucks.getByRole('row', { name: /Proba brisanja/ })).toHaveCount(0)
  expect(errors).toEqual([])
})
