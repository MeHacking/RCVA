import { expect, test, type Page } from '@playwright/test'
import writeExcelFile from 'write-excel-file/node'
import { collectPageErrors } from './consoleGuard.ts'

// A real .xlsx built for the test, with invented rows in the layout of the real file
// (RELACIJA | TEŽINA | DIMENZIJE). Default mock scenario "small" has 5 shipments.
const ROWS = [
  ['RELACIJA', 'TEŽINA', 'DIMENZIJE'],
  ['BEOGRAD 34131 - LJUNGBY', '1,200 kg', '2,4m'], // 2: ready
  ['NOVI SAD / RS / - / SE / 44361 STENKULLEN', '3,5t', '6,0m'], // 3: ready
  ['KRAGUJEVAC - LANDSKRONA 26100', '800kg', '1.2m'], // 4: ready
  ['LESKOVAC 12345-MALMO, 54321 LUND', '500 kg', '1m'], // 5: several destinations
  ['12345 SODERTALJE', '2,300 kg', '3,2m'], // 6: no pickup
  ['NIS - VAXJO 35230', '1,5 kg', 'abc'], // 7: bad LDM, weight warning
]

async function xlsx(rows: string[][]) {
  return {
    name: 'probni-uvoz.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await writeExcelFile(rows).toBuffer(),
  }
}

async function uploadAndMap(page: Page) {
  await page.goto('/shipments')
  await page.getByRole('button', { name: 'Uvezi Excel' }).click()
  await expect(page).toHaveURL('/shipments/import')
  await page.getByLabel('Fajl').setInputFiles(await xlsx(ROWS))
  await expect(page.getByRole('heading', { name: 'Povežite kolone fajla „probni-uvoz.xlsx“' })).toBeVisible()
}

const step = (page: Page) => page.getByRole('list', { name: 'Koraci uvoza' }).locator('[aria-current="step"]')
const summaryValue = (page: Page, label: string) =>
  page.locator('.import-summary > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')

test('imports an Excel file: mapping, corrections, exclusion, commit', async ({ page }) => {
  const errors = collectPageErrors(page)
  await uploadAndMap(page)

  // Step 2: columns suggested from the header names
  await expect(step(page)).toContainText('Mapiranje kolona')
  const mapping = page.getByRole('table', { name: 'Mapiranje kolona' })
  await expect(mapping.getByLabel('Relacija', { exact: true })).toHaveValue('0')
  await expect(mapping.getByLabel('Težina', { exact: true })).toHaveValue('1')
  await expect(mapping.getByLabel('LDM', { exact: true })).toHaveValue('2')
  await expect(page.getByRole('table', { name: 'Prvi redovi podataka' }).getByRole('row')).toHaveCount(6)
  await page.getByRole('button', { name: 'Dalje: pregled redova' }).click()

  // Step 3: three rows ready, three with errors (only those are listed)
  await expect(step(page)).toContainText('Pregled i ispravke')
  await expect(summaryValue(page, 'Redova')).toHaveText('6')
  await expect(summaryValue(page, 'Spremno za upis')).toHaveText('3')
  await expect(summaryValue(page, 'Sa greškom')).toHaveText('3')
  const table = page.getByRole('table', { name: 'Redovi za uvoz' })
  await expect(table.locator('tbody > tr')).toHaveCount(3)
  await expect(table.getByRole('row', { name: /^5 / })).toContainText('Više odredišta u jednoj relaciji')
  await expect(table.getByRole('row', { name: /^6 / })).toContainText('Nedostaje mesto preuzimanja.')
  await expect(table.getByRole('row', { name: /^7 / })).toContainText('LDM „abc“ nije prepoznat')
  await expect(table.getByRole('row', { name: /^7 / })).toContainText('ne liči na hiljade')

  // Row 6: add the missing pickup place
  await page.getByRole('button', { name: 'Ispravi red 6' }).click()
  const editor6 = page.getByRole('form', { name: 'Ispravka reda 6' })
  await expect(editor6).toContainText('„12345 SODERTALJE“')
  await editor6.getByRole('group', { name: 'Preuzimanje' }).getByLabel('Mesto').fill('Beograd')
  await editor6.getByRole('button', { name: 'Sačuvaj ispravku' }).click()
  await expect(summaryValue(page, 'Sa greškom')).toHaveText('2')

  // Row 7: fix LDM
  await page.getByRole('button', { name: 'Ispravi red 7' }).click()
  const editor7 = page.getByRole('form', { name: 'Ispravka reda 7' })
  await editor7.getByLabel('LDM').fill('2,0')
  await editor7.getByRole('button', { name: 'Sačuvaj ispravku' }).click()
  await expect(summaryValue(page, 'Sa greškom')).toHaveText('1')

  // Row 5: exclude
  await page.getByRole('button', { name: 'Isključi red 5' }).click()
  await expect(summaryValue(page, 'Sa greškom')).toHaveText('0')
  await expect(summaryValue(page, 'Spremno za upis')).toHaveText('5')
  await expect(summaryValue(page, 'Isključeno')).toHaveText('1')
  await expect(summaryValue(page, 'Ručno ispravljeno')).toHaveText('2')
  await expect(table.locator('tbody > tr')).toHaveCount(6) // no errors left: all rows shown

  // Step 4: confirm and commit
  await page.getByRole('button', { name: 'Dalje: potvrda' }).click()
  await expect(step(page)).toContainText('Potvrda')
  await expect(page.getByText('Biće upisano pošiljki: 5 (ukupno 14,8 LDM), od toga ručno ispravljenih: 2')).toBeVisible()
  await expect(page.getByText('Preskače se redova: 1 (sa greškom: 0, isključeno: 1)')).toBeVisible()
  await page.getByRole('button', { name: 'Upiši pošiljke (5)' }).click()
  await expect(page.getByText('Upisano pošiljki: 5')).toBeVisible()

  // The table now has 10 shipments; two delivery places are not geocodable in the mock.
  await page.getByRole('link', { name: 'Pogledaj pošiljke' }).click()
  await expect(page.getByText(/Pošiljki: 10 · ukupno 35,7 LDM · sa greškom: 2/)).toBeVisible()
  const shipments = page.getByRole('table', { name: 'Pošiljke' })
  await expect(shipments.getByRole('row', { name: /probni-uvoz-2/ })).toContainText('U redu')
  await expect(shipments.getByRole('row', { name: /probni-uvoz-7/ })).toContainText('Nejasna lokacija')
  expect(errors).toEqual([])
})

test('confirm reflects an exclusion made right before moving on', async ({ page }) => {
  await uploadAndMap(page)
  await page.getByRole('button', { name: 'Dalje: pregled redova' }).click()
  await page.getByRole('button', { name: 'Isključi red 5' }).click()
  await page.getByRole('button', { name: 'Dalje: potvrda' }).click() // waits until the button is enabled again

  await expect(page.getByText('Preskače se redova: 3 (sa greškom: 2, isključeno: 1)')).toBeVisible()
})

test('the mapping step shows server validation per field', async ({ page }) => {
  await uploadAndMap(page)
  const mapping = page.getByRole('table', { name: 'Mapiranje kolona' })
  await mapping.getByLabel('Relacija', { exact: true }).selectOption('')
  await mapping.getByLabel('LDM', { exact: true }).selectOption('')
  await page.getByRole('button', { name: 'Dalje: pregled redova' }).click()

  await expect(page.getByText('Potrebna je kolona Relacija ili obe kolone Preuzimanje i Isporuka.')).toBeVisible()
  await expect(page.getByText('Kolona sa LDM je obavezna.')).toBeVisible()
  await expect(mapping.getByLabel('LDM', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(step(page)).toContainText('Mapiranje kolona')
})

test('rejects a file that is not .xlsx', async ({ page }) => {
  await page.goto('/shipments/import')
  await page.getByLabel('Fajl').setInputFiles({ name: 'posiljke.csv', mimeType: 'text/csv', buffer: Buffer.from('a;b') })
  await expect(page.getByRole('alert')).toContainText('Podržani su samo .xlsx fajlovi. (HTTP 415)')
})
