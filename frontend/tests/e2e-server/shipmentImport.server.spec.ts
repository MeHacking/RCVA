import { expect, test, type Page } from '@playwright/test'
import writeExcelFile from 'write-excel-file/node'
import { collectPageErrors } from '../e2e/consoleGuard.ts'

// The Excel import against the backend (Apache POI), the same flow as
// tests/e2e/shipmentImport.spec.ts on the mock. Invented rows in the layout of the real
// file (RELACIJA | TEŽINA | DIMENZIJE); the backend starts with the 5 sample shipments.
const ROWS = [
  ['RELACIJA', 'TEŽINA', 'DIMENZIJE'],
  ['BEOGRAD 34131 - LJUNGBY', '1,200 kg', '2,4m'], // 2: ready
  ['NOVI SAD / RS / - / SE / 44361 STENKULLEN', '3,5t', '6,0m'], // 3: ready
  ['KRAGUJEVAC - LANDSKRONA 26100', '800kg', '1.2m'], // 4: ready
  ['LESKOVAC 12345-MALMO, 54321 LUND', '500 kg', '1m'], // 5: several destinations
  ['12345 SODERTALJE', '2,300 kg', '3,2m'], // 6: no pickup
  ['NIS - VAXJO 35230', '1,5 kg', 'abc'], // 7: bad LDM, weight warning
]

const step = (page: Page) => page.getByRole('list', { name: 'Koraci uvoza' }).locator('[aria-current="step"]')
const summaryValue = (page: Page, label: string) =>
  page.locator('.import-summary > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')

test('shipments come from the server and the sidebar says so', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/shipments')
  await expect(page.getByTestId('data-source')).toHaveText('Kamioni i pošiljke: server · optimizacija: probni podaci')
  await expect(page.getByText(/Pošiljki: 5 · ukupno 20,9 LDM/)).toBeVisible()
  expect(errors).toEqual([])
})

test('imports an Excel file on the server; the shipments survive a reload', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/shipments')
  await page.getByRole('button', { name: 'Uvezi Excel' }).click()
  await page.getByLabel('Fajl').setInputFiles({
    name: 'probni-uvoz.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await writeExcelFile(ROWS).toBuffer(),
  })

  // Step 2: the file was read by the server
  await expect(page.getByRole('heading', { name: 'Povežite kolone fajla „probni-uvoz.xlsx“' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Prvi redovi podataka' }).getByRole('row')).toHaveCount(6)
  await page.getByRole('button', { name: 'Dalje: pregled redova' }).click()

  // Step 3: the same rules as the mock
  await expect(step(page)).toContainText('Pregled i ispravke')
  await expect(summaryValue(page, 'Spremno za upis')).toHaveText('3')
  await expect(summaryValue(page, 'Sa greškom')).toHaveText('3')
  const table = page.getByRole('table', { name: 'Redovi za uvoz' })
  await expect(table.getByRole('row', { name: /^5 / })).toContainText('Više odredišta u jednoj relaciji')
  await expect(table.getByRole('row', { name: /^7 / })).toContainText('LDM „abc“ nije prepoznat')

  await page.getByRole('button', { name: 'Ispravi red 6' }).click()
  const editor6 = page.getByRole('form', { name: 'Ispravka reda 6' })
  await editor6.getByRole('group', { name: 'Preuzimanje' }).getByLabel('Mesto').fill('Beograd')
  await editor6.getByRole('button', { name: 'Sačuvaj ispravku' }).click()
  await expect(summaryValue(page, 'Sa greškom')).toHaveText('2')

  await page.getByRole('button', { name: 'Ispravi red 7' }).click()
  const editor7 = page.getByRole('form', { name: 'Ispravka reda 7' })
  await editor7.getByLabel('LDM').fill('2,0')
  await editor7.getByRole('button', { name: 'Sačuvaj ispravku' }).click()
  await expect(summaryValue(page, 'Sa greškom')).toHaveText('1')

  await page.getByRole('button', { name: 'Isključi red 5' }).click()
  await expect(summaryValue(page, 'Spremno za upis')).toHaveText('5')

  // Step 4
  await page.getByRole('button', { name: 'Dalje: potvrda' }).click()
  await page.getByRole('button', { name: 'Upiši pošiljke (5)' }).click()
  await expect(page.getByText('Upisano pošiljki: 5')).toBeVisible()

  await page.getByRole('link', { name: 'Pogledaj pošiljke' }).click()
  const summary = /Pošiljki: 10 · ukupno 35,7 LDM · sa greškom: 2/
  await expect(page.getByText(summary)).toBeVisible()
  await page.reload()
  await expect(page.getByText(summary)).toBeVisible()
  const shipments = page.getByRole('table', { name: 'Pošiljke' })
  await expect(shipments.getByRole('row', { name: /probni-uvoz-2/ })).toContainText('U redu')
  await expect(shipments.getByRole('row', { name: /probni-uvoz-7/ })).toContainText('Nejasna lokacija')
  expect(errors).toEqual([])
})

test('the server rejects a file that is not .xlsx', async ({ page }) => {
  await page.goto('/shipments/import')
  await page.getByLabel('Fajl').setInputFiles({ name: 'posiljke.csv', mimeType: 'text/csv', buffer: Buffer.from('a;b') })
  await expect(page.getByRole('alert')).toContainText('Podržani su samo .xlsx fajlovi. (HTTP 415)')
})
