import { expect, test, type Page } from '@playwright/test'
import writeExcelFile from 'write-excel-file/node'
import { collectPageErrors } from '../consoleGuard.ts'

// Correcting a shipment after the import, in the application on the device. Nominatim is
// faked with page.route; it knows only invented places, so Losestad has no coordinates.
const PLACES: Record<string, [number, number]> = {
  Primerovo: [45.1, 20.1],
  Drugovo: [44.5, 20.6],
  Novostad: [58.2, 13.3],
  // Found only as written with its letters; the file writes it LOSESTAD.
  Lösestad: [59.4, 16.5],
}

async function fakeNominatim(page: Page) {
  const asked: string[] = []
  await page.route('https://nominatim.openstreetmap.org/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    asked.push(q)
    const place = PLACES[q]
    await route.fulfill({
      json: place ? [{ lat: String(place[0]), lon: String(place[1]), display_name: q }] : [],
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  })
  return asked
}

/** Imports the rows and opens the shipments; the ids are "uvoz-2", "uvoz-3"... */
async function importRows(page: Page, rows: string[][]) {
  await page.goto('/shipments/import')
  await page.getByLabel('Fajl').setInputFiles({
    name: 'uvoz.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await writeExcelFile([['RELACIJA', 'TEŽINA', 'DIMENZIJE'], ...rows]).toBuffer(),
  })
  await page.getByRole('button', { name: 'Dalje: pregled redova' }).click()
  // The number next to a place is kept but never shown (whether it is a postal code is an open question).
  await expect(page.getByRole('table', { name: 'Redovi za uvoz' }).locator('tbody td')).not.toContainText(['11111'])
  await page.getByRole('button', { name: 'Dalje: potvrda' }).click()
  await page.getByRole('button', { name: /^Upiši pošiljke/ }).click()
  await expect(page.getByText(`Upisano pošiljki: ${rows.length}`, { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: 'Pogledaj pošiljke' }).click()
}

const table = (page: Page) => page.getByRole('table', { name: 'Pošiljke' })
/** The row of a shipment, found by its first cell (the editor row below it has no ID cell). */
const row = (page: Page, id: string) =>
  table(page).getByRole('row').filter({ has: page.getByRole('cell', { name: id, exact: true }) })

async function edit(page: Page, id: string) {
  await page.getByRole('button', { name: `Izmeni pošiljku ${id}` }).click()
  return page.getByRole('form', { name: `Izmena pošiljke ${id}` })
}

test('corrects an unclear place once for all its shipments, asking only for the new name', async ({ page }) => {
  const errors = collectPageErrors(page)
  const asked = await fakeNominatim(page)
  await importRows(page, [
    ['PRIMEROVO - LOSESTAD 11111', '1,200 kg', '2,4m'],
    ['DRUGOVO - LOSESTAD 11111', '800 kg', '1,2m'],
  ])
  await expect(row(page, 'uvoz-2')).toContainText('Nejasna lokacija')
  await expect(row(page, 'uvoz-3')).toContainText('Nejasna lokacija')
  await expect(table(page).getByRole('columnheader', { name: 'Poštanski broj' })).toHaveCount(0)
  await expect(table(page)).not.toContainText('11111')
  asked.length = 0

  const form = await edit(page, 'uvoz-2')
  await expect(form.getByLabel('Poštanski broj')).toHaveCount(0)
  const delivery = form.getByRole('group', { name: 'Isporuka' })
  await expect(delivery).toContainText('Nema koordinata (nejasna lokacija).')
  await expect(form.getByRole('group', { name: 'Preuzimanje' })).toContainText('Koordinate: 45,10000° N, 20,10000° E')
  // Offered only once the place is replaced.
  const others = delivery.getByLabel('Ispravi i u ostalim pošiljkama sa mestom „Losestad“ (1)')
  await expect(others).toBeHidden()
  await delivery.getByLabel('Mesto').fill('Novostad')
  await expect(others).toBeChecked()
  await expect(form).toContainText('© OpenStreetMap contributors')
  await form.getByRole('button', { name: 'Sačuvaj izmenu' }).click()

  const saved = page.getByRole('status').filter({ hasText: 'Pošiljka „uvoz-2“ je sačuvana.' })
  await expect(saved).toContainText('„Novostad“: koordinate su pronađene.')
  await expect(saved).toContainText('Ispravljeno je i ostalih pošiljki sa istim mestom: 1.')
  await expect(form).toBeHidden()
  for (const id of ['uvoz-2', 'uvoz-3']) {
    await expect(row(page, id)).toContainText('Novostad')
    await expect(row(page, id)).toContainText('Ručno uneta lokacija')
  }
  expect(asked).toEqual(['Novostad'])

  await page.reload()
  await expect(row(page, 'uvoz-3')).toContainText('Ručno uneta lokacija')
  expect(asked).toEqual(['Novostad'])
  expect(errors).toEqual([])
})

test('takes coordinates by hand when the place is not found, and says when it is not', async ({ page }) => {
  const errors = collectPageErrors(page)
  const asked = await fakeNominatim(page)
  await importRows(page, [['PRIMEROVO - LOSESTAD 11111', '1,200 kg', '2,4m']])
  asked.length = 0

  // Another name Nominatim does not know: saved, but still unclear.
  let form = await edit(page, 'uvoz-2')
  await form.getByRole('group', { name: 'Isporuka' }).getByLabel('Mesto').fill('Nigdeovo')
  await form.getByRole('button', { name: 'Sačuvaj izmenu' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'je sačuvana' })).toContainText(
    '„Nigdeovo“ nije pronađeno, pa lokacija ostaje nejasna.',
  )
  await expect(row(page, 'uvoz-2')).toContainText('Nejasna lokacija')
  expect(asked).toEqual(['Nigdeovo'])

  form = await edit(page, 'uvoz-2')
  const delivery = form.getByRole('group', { name: 'Isporuka' })
  const coordinates = delivery.getByLabel('Koordinate (ručno, neobavezno)')
  await coordinates.fill('Nigdeovo')
  await form.getByRole('button', { name: 'Sačuvaj izmenu' }).click()
  await expect(delivery).toContainText('Unesite širinu i dužinu, npr. 45.2671, 19.8335.')
  await expect(coordinates).toHaveAttribute('aria-invalid', 'true')

  await coordinates.fill('59.1, 15.2')
  await form.getByRole('button', { name: 'Sačuvaj izmenu' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'je sačuvana' })).toContainText(
    '„Nigdeovo“: koordinate su unete ručno.',
  )
  await expect(row(page, 'uvoz-2')).toContainText('Ručno uneta lokacija')
  expect(asked).toEqual(['Nigdeovo'])

  // A place with coordinates keeps them: no field for coordinates by hand.
  form = await edit(page, 'uvoz-2')
  await expect(form.getByRole('group', { name: 'Isporuka' })).toContainText('Koordinate: 59,10000° N, 15,20000° E (ručno uneta lokacija)')
  await expect(form.getByLabel('Koordinate (ručno, neobavezno)')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('changes the other fields, and shows the reason when a field is refused', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/shipments')
  const form = await edit(page, 'S-101')
  await form.getByLabel('ID', { exact: true }).fill('S-102')
  await form.getByRole('button', { name: 'Sačuvaj izmenu' }).click()
  await expect(form.getByText('ID „S-102“ već postoji među pošiljkama.')).toBeVisible()
  await expect(form.getByRole('alert')).toContainText('Izmena nije sačuvana')

  await form.getByLabel('ID', { exact: true }).fill('S-101a')
  await form.getByLabel('LDM').fill('3,5')
  await form.getByLabel('Težina (kg)').fill('')
  await form.getByRole('button', { name: 'Sačuvaj izmenu' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Pošiljka „S-101a“ je sačuvana.' })).toBeVisible()
  await expect(row(page, 'S-101a').getByRole('cell')).toHaveText(['S-101a', 'Subotica', 'Ljungby', '3,5', '–', 'nije uneto', 'U redu', 'Izmeni'])

  await page.reload()
  await expect(row(page, 'S-101a')).toContainText('3,5')
  expect(errors).toEqual([])
})

test('asks again for a name typed by hand, also one that differs from the file only in its letters', async ({ page }) => {
  const errors = collectPageErrors(page)
  const asked = await fakeNominatim(page)
  await importRows(page, [['PRIMEROVO - LOSESTAD 11111', '1,200 kg', '2,4m']])
  expect(asked).toEqual(['Primerovo', 'Losestad'])

  const form = await edit(page, 'uvoz-2')
  await form.getByRole('group', { name: 'Isporuka' }).getByLabel('Mesto').fill('Lösestad')
  await form.getByRole('button', { name: 'Sačuvaj izmenu' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'je sačuvana' })).toContainText('„Lösestad“: koordinate su pronađene.')
  await expect(row(page, 'uvoz-2')).toContainText('Lösestad')
  await expect(row(page, 'uvoz-2')).toContainText('Ručno uneta lokacija')
  expect(asked).toEqual(['Primerovo', 'Losestad', 'Lösestad'])
  expect(errors).toEqual([])
})
