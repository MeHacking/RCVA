import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Runs against the default mock scenario "small" (3 trucks). Mock state lives in memory,
// so every page load starts from the fixture again.

async function addType(page: Page, type: { name: string; ldm: string; kg?: string; dimensions?: [string, string, string] }) {
  await page.getByRole('button', { name: 'Dodaj tip kamiona' }).click()
  await page.getByLabel('Naziv tipa').fill(type.name)
  await page.getByLabel('Kapacitet (LDM)').fill(type.ldm)
  if (type.kg) await page.getByLabel('Nosivost (kg)').fill(type.kg)
  if (type.dimensions) {
    await page.getByLabel('Dužina').fill(type.dimensions[0])
    await page.getByLabel('Širina').fill(type.dimensions[1])
    await page.getByLabel('Visina').fill(type.dimensions[2])
  }
  await page.getByRole('button', { name: 'Sačuvaj tip' }).click()
  await expect(page.getByRole('table', { name: 'Tipovi kamiona' }).getByRole('row', { name: new RegExp(type.name) })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/trucks')
  await expect(page.getByRole('table', { name: 'Kamioni' })).toBeVisible()
})

test('lists the fixture trucks', async ({ page }) => {
  const rows = page.getByRole('table', { name: 'Kamioni' }).getByRole('row')
  await expect(rows).toHaveCount(4) // header + 3
  await expect(rows.nth(1)).toContainText('Šleper 1')
  await expect(rows.nth(1)).toContainText('13,6')
  await expect(rows.nth(1)).toContainText('13600 × 2480 × 2700 mm')
})

test('rejects capacity 0 and keeps the table unchanged', async ({ page }) => {
  await page.getByRole('button', { name: 'Izmeni Šleper 1' }).click()
  const capacity = page.getByLabel('Kapacitet (LDM)')
  await capacity.fill('0')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  await expect(page.getByText('Kapacitet mora biti veći od 0.')).toBeVisible()
  await expect(capacity).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row').nth(1)).toContainText('13,6')
})

test('edits a truck and shows the saved values', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.getByRole('button', { name: 'Izmeni Šleper 2' }).click()
  await page.getByLabel('Naziv').fill('Šleper 2 (novi)')
  await page.getByLabel('Kapacitet (LDM)').fill('12.5')
  await page.getByLabel('Dostupan za optimizaciju').uncheck()
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  await expect(page.getByRole('heading', { name: /Izmena kamiona/ })).toBeHidden()
  const row = page.getByRole('row', { name: /Šleper 2 \(novi\)/ })
  await expect(row).toContainText('12,5')
  await expect(row).toContainText('Ne')
  expect(errors).toEqual([])
})

test('adds a truck without dimensions', async ({ page }) => {
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('Solo 2')
  await page.getByLabel('Kapacitet (LDM)').fill('7')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  const row = page.getByRole('row', { name: /Solo 2/ })
  await expect(row).toContainText('7,0')
  await expect(row).toContainText('nije uneto')
})

test('saves a payload, and shows an empty one as not limited', async ({ page }) => {
  await expect(page.getByRole('row', { name: /Šleper 1/ })).toContainText('bez ograničenja')
  await page.getByRole('button', { name: 'Izmeni Šleper 1' }).click()
  const payload = page.getByLabel('Nosivost (kg)')
  await payload.fill('24 t')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('Unesite pozitivan ceo broj kilograma, npr. 24000.')).toBeVisible()
  await expect(payload).toHaveAttribute('aria-invalid', 'true')

  await payload.fill('24000')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByRole('row', { name: /Šleper 1/ })).toContainText('24000')
})

test('fills a new truck from a truck type, never from a truck in the list', async ({ page }) => {
  const errors = collectPageErrors(page)
  // Nothing to choose when changing a truck.
  await page.getByRole('button', { name: 'Izmeni Šleper 1' }).click()
  await expect(page.getByLabel('Popuni prema')).toHaveCount(0)
  await page.getByRole('button', { name: 'Otkaži' }).click()

  await addType(page, { name: 'Hladnjača', ldm: '12,0', kg: '18000', dimensions: ['12000', '2400', '2500'] })

  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  const template = page.getByLabel('Popuni prema')
  await expect(template.getByRole('option')).toHaveText([
    'Ručni unos',
    'Standardna cerada (13,6 LDM, 24000 kg, 13600 × 2480 × 2700 mm)',
    'Hladnjača (12,0 LDM, 18000 kg, 12000 × 2400 × 2500 mm)',
  ])

  await template.selectOption({ label: 'Standardna cerada (13,6 LDM, 24000 kg, 13600 × 2480 × 2700 mm)' })
  await expect(page.getByLabel('Naziv', { exact: true })).toHaveValue('Kamion 1')
  await expect(page.getByLabel('Kapacitet (LDM)')).toHaveValue('13,6')
  await expect(page.getByLabel('Nosivost (kg)')).toHaveValue('24000')
  await expect(page.getByLabel('Dužina')).toHaveValue('13600')

  await template.selectOption({ label: 'Hladnjača (12,0 LDM, 18000 kg, 12000 × 2400 × 2500 mm)' })
  await expect(page.getByLabel('Naziv', { exact: true })).toHaveValue('Hladnjača 1')
  await expect(page.getByLabel('Kapacitet (LDM)')).toHaveValue('12,0')
  await expect(page.getByLabel('Nosivost (kg)')).toHaveValue('18000')
  await expect(page.getByLabel('Visina')).toHaveValue('2500')

  // A name the user typed stays when another type is chosen.
  await page.getByLabel('Naziv', { exact: true }).fill('Hladnjača Novi Sad')
  await template.selectOption({ label: 'Standardna cerada (13,6 LDM, 24000 kg, 13600 × 2480 × 2700 mm)' })
  await expect(page.getByLabel('Naziv', { exact: true })).toHaveValue('Hladnjača Novi Sad')
  await template.selectOption({ label: 'Hladnjača (12,0 LDM, 18000 kg, 12000 × 2400 × 2500 mm)' })
  await page.getByRole('button', { name: 'Sačuvaj', exact: true }).click()

  const trucks = page.getByRole('table', { name: 'Kamioni' })
  const row = trucks.getByRole('row', { name: /Hladnjača Novi Sad/ })
  await expect(row).toContainText('12,0')
  await expect(row).toContainText('12000 × 2400 × 2500 mm')
  await expect(trucks.getByRole('row')).toHaveCount(5) // header + 4
  expect(errors).toEqual([])
})

test('adds, changes and removes a truck type; the standard curtain-sider stays as it is', async ({ page }) => {
  const errors = collectPageErrors(page)
  const types = page.getByRole('table', { name: 'Tipovi kamiona' })
  // Not a card of its own until asked for: "Dodaj tip kamiona", next to "Dodaj kamion", opens
  // the form together with the types there are.
  await expect(page.getByRole('region', { name: 'Tipovi kamiona' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Dodaj tip kamiona' }).click()
  await expect(page.getByLabel('Naziv tipa')).toBeFocused()
  await expect(types.getByRole('row')).toHaveCount(2) // header + the standard curtain-sider
  const standard = types.getByRole('row', { name: /Standardna cerada/ })
  await expect(standard).toContainText('24000')
  await expect(standard).toContainText('ugrađen')
  await expect(standard.getByRole('button')).toHaveCount(0)

  // Checked as a truck is; the built-in name and a name already used are refused.
  await page.getByLabel('Kapacitet (LDM)').fill('0')
  await page.getByRole('button', { name: 'Sačuvaj tip' }).click()
  await expect(page.getByText('Unesite naziv tipa.')).toBeVisible()
  await expect(page.getByText('Kapacitet mora biti veći od 0.')).toBeVisible()
  await page.getByLabel('Naziv tipa').fill('standardna cerada')
  await page.getByLabel('Kapacitet (LDM)').fill('13,6')
  await page.getByRole('button', { name: 'Sačuvaj tip' }).click()
  await expect(page.locator('.field__error', { hasText: '„Standardna cerada“ je ugrađen tip; izaberite drugi naziv.' })).toBeVisible()
  await page.getByRole('button', { name: 'Otkaži' }).click()
  await expect(types.getByRole('row')).toHaveCount(2)

  await addType(page, { name: 'Solo', ldm: '7' })
  await expect(types.getByRole('row', { name: /Solo/ })).toContainText('bez ograničenja')
  await page.getByRole('button', { name: 'Dodaj tip kamiona' }).click()
  await page.getByLabel('Naziv tipa').fill(' SOLO ')
  await page.getByLabel('Kapacitet (LDM)').fill('7')
  await page.getByRole('button', { name: 'Sačuvaj tip' }).click()
  await expect(page.locator('.field__error', { hasText: 'Tip sa tim nazivom već postoji.' })).toBeVisible()
  await page.getByRole('button', { name: 'Otkaži' }).click()

  // Changing a type changes no truck.
  const trucksBefore = await page.getByRole('table', { name: 'Kamioni' }).innerText()
  await page.getByRole('button', { name: 'Izmeni tip Solo' }).click()
  await expect(page.getByLabel('Naziv tipa')).toHaveValue('Solo')
  await page.getByLabel('Naziv tipa').fill('Solo 7 m')
  await page.getByLabel('Nosivost (kg)').fill('9000')
  await page.getByRole('button', { name: 'Sačuvaj tip' }).click()
  await expect(types.getByRole('row', { name: /Solo 7 m/ })).toContainText('9000')
  expect(await page.getByRole('table', { name: 'Kamioni' }).innerText()).toBe(trucksBefore)

  // Removed after confirming in the row; cancel keeps it.
  await page.getByRole('button', { name: 'Ukloni tip Solo 7 m' }).click()
  await page.getByRole('group', { name: 'Potvrda uklanjanja tipa: Solo 7 m' }).getByRole('button', { name: 'Otkaži' }).click()
  await expect(types.getByRole('row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Ukloni tip Solo 7 m' }).click()
  await page.getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(types.getByRole('row')).toHaveCount(2)
  await page.getByRole('region', { name: 'Tipovi kamiona' }).getByRole('button', { name: 'Zatvori' }).click()
  await expect(page.getByRole('region', { name: 'Tipovi kamiona' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await expect(page.getByLabel('Popuni prema').getByRole('option')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('a new type left with "Otkaži" goes on where it was; a type like another is refused', async ({ page }) => {
  const errors = collectPageErrors(page)
  // No more "Napravi tip" in the rows of the trucks.
  await expect(page.getByRole('button', { name: /^Napravi tip/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Dodaj tip kamiona' }).click()
  await page.getByLabel('Naziv tipa').fill('Hladnjača')
  await page.getByLabel('Kapacitet (LDM)').fill('13,6')
  await page.getByRole('button', { name: 'Otkaži' }).click()

  // The card stays, and its button goes on with what was typed.
  const card = page.getByRole('region', { name: 'Tipovi kamiona' })
  await card.getByRole('button', { name: 'Nastavi dodavanje tipa' }).click()
  await expect(page.getByLabel('Naziv tipa')).toHaveValue('Hladnjača')
  await expect(page.getByLabel('Kapacitet (LDM)')).toHaveValue('13,6')
  // The standard curtain-sider's measures under another name: a duplicate.
  await page.getByLabel('Nosivost (kg)').fill('24000')
  await page.getByLabel('Dužina').fill('13600')
  await page.getByLabel('Širina').fill('2480')
  await page.getByLabel('Visina').fill('2700')
  await page.getByRole('button', { name: 'Sačuvaj tip' }).click()
  await expect(page.locator('.field__error', { hasText: 'Tip „Standardna cerada“ već ima iste mere' })).toBeVisible()
  await page.getByLabel('Nosivost (kg)').fill('18000')
  await page.getByRole('button', { name: 'Sačuvaj tip' }).click()
  await expect(page.getByRole('table', { name: 'Tipovi kamiona' }).getByRole('row', { name: /Hladnjača/ })).toContainText('18000')
  // Saved: the next one starts empty.
  await card.getByRole('button', { name: 'Dodaj tip' }).click()
  await expect(page.getByLabel('Naziv tipa')).toHaveValue('')
  expect(errors).toEqual([])
})

test('removes every truck after asking, and puts them back on "Poništi"', async ({ page }) => {
  const errors = collectPageErrors(page)
  const trucks = page.getByRole('table', { name: 'Kamioni' })
  await expect(trucks.getByRole('row')).toHaveCount(4) // header + 3
  const before = await trucks.innerText()

  // "Odustani" keeps them.
  await page.getByRole('button', { name: 'Ukloni sve kamione' }).click()
  await expect(page.getByText('Ukloniti sve kamione (3)?')).toBeVisible()
  await page.getByRole('button', { name: 'Odustani' }).click()
  await expect(trucks.getByRole('row')).toHaveCount(4)

  await page.getByRole('button', { name: 'Ukloni sve kamione' }).click()
  await page.getByRole('button', { name: 'Da, ukloni sve' }).click()
  await expect(page.getByText('Uklonjeno kamiona: 3')).toBeVisible()
  await expect(trucks).toHaveCount(0)
  await expect(page.getByText('Nema unetih kamiona')).toBeVisible()

  // Back as they were, with their ids.
  await page.getByRole('button', { name: 'Poništi' }).click()
  await expect(trucks.getByRole('row')).toHaveCount(4)
  expect(await trucks.innerText()).toBe(before)
  await expect(page.getByText('Uklonjeno kamiona: 3')).toHaveCount(0)

  // A truck added after removing them all ends the chance to undo.
  await page.getByRole('button', { name: 'Ukloni sve kamione' }).click()
  await page.getByRole('button', { name: 'Da, ukloni sve' }).click()
  await expect(page.getByText('Uklonjeno kamiona: 3')).toBeVisible()
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv', { exact: true }).fill('Nova cerada')
  await page.getByLabel('Kapacitet (LDM)').fill('13,6')
  await page.getByRole('button', { name: 'Sačuvaj', exact: true }).click()
  await expect(trucks.getByRole('row', { name: /Nova cerada/ })).toContainText('1')
  await expect(page.getByRole('button', { name: 'Poništi' })).toHaveCount(0)
  expect(errors).toEqual([])
})
test('requires all three dimensions or none', async ({ page }) => {
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('X')
  await page.getByLabel('Kapacitet (LDM)').fill('7')
  await page.getByLabel('Dužina').fill('7000')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()

  await expect(page.getByText('Unesite sve tri dimenzije tovarnog prostora ili nijednu.')).toBeVisible()
})

test('removes a truck after confirming in the row; cancel keeps it', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.getByRole('button', { name: 'Ukloni Solo 1' }).click()
  const confirm = page.getByRole('group', { name: 'Potvrda uklanjanja: Solo 1' })
  await expect(confirm).toContainText('Ukloniti kamion?')
  await confirm.getByRole('button', { name: 'Otkaži' }).click()
  await expect(page.getByRole('row', { name: /Solo 1/ })).toBeVisible()

  await page.getByRole('button', { name: 'Ukloni Solo 1' }).click()
  await page.getByRole('group', { name: 'Potvrda uklanjanja: Solo 1' }).getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('row', { name: /Solo 1/ })).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row')).toHaveCount(3) // header + 2
  expect(errors).toEqual([])
})

test('closes the edit form when the edited truck is removed', async ({ page }) => {
  await page.getByRole('button', { name: 'Izmeni Šleper 2' }).click()
  await expect(page.getByRole('heading', { name: 'Izmena kamiona #2' })).toBeVisible()
  await page.getByRole('button', { name: 'Ukloni Šleper 2' }).click()
  await page.getByRole('group', { name: 'Potvrda uklanjanja: Šleper 2' }).getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('heading', { name: 'Izmena kamiona #2' })).toBeHidden()
  await expect(page.getByRole('row', { name: /Šleper 2/ })).toHaveCount(0)
})

test('refuses removal while an optimization is running', async ({ page }) => {
  await page.getByRole('banner').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  // The job exists once the top bar names it (starting asks first where the trucks are).
  await expect(page.getByTestId('last-job-status')).toContainText('Posao #1')
  await page.getByRole('button', { name: 'Ukloni Šleper 1' }).click()
  await page.getByRole('group', { name: 'Potvrda uklanjanja: Šleper 1' }).getByRole('button', { name: 'Da, ukloni' }).click()

  await expect(page.getByRole('alert')).toContainText(
    'Kamion „Šleper 1“ nije uklonjen: Optimizacija #1 je u toku; kamion se može ukloniti kada se završi. (HTTP 409)',
  )
  await expect(page.getByRole('row', { name: /Šleper 1/ })).toBeVisible()
})
