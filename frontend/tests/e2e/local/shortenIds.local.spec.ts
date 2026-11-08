import { expect, test } from '@playwright/test'
import writeExcelFile from 'write-excel-file/node'
import { collectPageErrors } from '../consoleGuard.ts'

// Shipments named by an earlier import after the file and the row ("Relacija-tezina-14") get
// a short name by relation once the user agrees. Such names are made here by an ID column.

test('offers short names for names made from the file, and renames only those', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ json: [], headers: { 'Access-Control-Allow-Origin': '*' } }),
  )
  await page.goto('/shipments/import')
  await page.getByLabel('Fajl').setInputFiles({
    name: 'nedelja.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await writeExcelFile([
      ['ID', 'RELACIJA', 'DIMENZIJE'],
      ['Relacija-tezina-dimenzija-2', 'PRIMEROVO - LOSESTAD', '2,4m'],
      ['Relacija-tezina-dimenzija-3', 'PRIMEROVO - LOSESTAD', '1m'],
      ['NALOG-7', 'DRUGOVO - TESTSTAD', '1m'],
    ]).toBuffer(),
  })
  await page.getByRole('button', { name: 'Dalje: pregled redova' }).click()
  await page.getByRole('button', { name: 'Dalje: potvrda' }).click()
  await page.getByRole('button', { name: /^Upiši pošiljke/ }).click()
  await expect(page.getByText('Upisano pošiljki: 3', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: 'Pogledaj pošiljke' }).click()

  const notice = page.getByRole('status').filter({ hasText: 'Dugački nazivi pošiljki (2)' })
  await expect(notice).toContainText('Relacija-tezina-dimenzija-2 → PRI-LOS-1')
  await expect(notice).toContainText('Relacija-tezina-dimenzija-3 → PRI-LOS-2')
  await notice.getByRole('button', { name: 'Skrati nazive' }).click()
  await expect(page.getByText('Skraćeno naziva: 2')).toBeVisible()
  await expect(notice).toHaveCount(0)

  const table = page.getByRole('table', { name: 'Pošiljke' })
  for (const id of ['PRI-LOS-1', 'PRI-LOS-2', 'NALOG-7']) {
    await expect(table.getByRole('cell', { name: id, exact: true })).toBeVisible()
  }
  await expect(table).not.toContainText('Relacija-tezina')

  // Kept after a reload, and not offered again.
  await page.reload()
  await expect(table.getByRole('cell', { name: 'PRI-LOS-2', exact: true })).toBeVisible()
  await expect(page.getByText('Dugački nazivi pošiljki')).toHaveCount(0)
  expect(errors).toEqual([])
})
