import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The results as a PDF: in the browser "Izvezi PDF" opens the print dialog (window.print,
// faked here), and what prints is the report alone: the summary on page one, then every
// truck on a page of its own. Scenario "small": the job uses 2 trucks.

test('prints the report alone: the summary, then each truck on a page of its own', async ({ page }) => {
  const errors = collectPageErrors(page)
  // The print dialog cannot be answered in a test: count the calls and keep the page title.
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { printed: string[] }).printed = seen
    window.print = () => void seen.push(document.title)
  })
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('1')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 30_000 })

  // On the screen the report is not there; the application is.
  const report = page.getByTestId('result-report')
  await expect(report).toBeHidden()
  await page.getByRole('button', { name: 'Izvezi PDF' }).click()
  // The browser names the file after the page title, set for the print and put back.
  expect(await page.evaluate(() => (window as unknown as { printed: string[] }).printed)).toEqual(['rcva-rezultat-posao-1'])
  expect(await page.title()).not.toContain('rcva-rezultat')

  // In print: the report alone, each truck from a new page.
  await page.emulateMedia({ media: 'print' })
  await expect(report).toBeVisible()
  await expect(page.locator('#root')).toBeHidden()
  await expect(report.getByRole('heading', { level: 1 })).toHaveText('Rezultat optimizacije')
  await expect(report).toContainText('Posao #1')
  const trucks = report.locator('.report__truck')
  await expect(trucks).toHaveCount(2)
  await expect(trucks.first().getByRole('heading')).toHaveText('Šleper 1')
  expect(await trucks.evaluateAll((all) => all.map((t) => getComputedStyle(t).breakBefore))).toEqual(['page', 'page'])
  // Šleper 1: its start, three pickups and three deliveries (as on the results screen).
  await expect(trucks.first().getByRole('row')).toHaveCount(1 + 1 + 6)
  await expect(trucks.first()).toContainText('Polazak')

  // The PDF Chromium makes of it: one page of summary and one per truck.
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(3)
  expect(errors).toEqual([])
})
