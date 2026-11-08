import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The results as a PDF: in the browser "Izvezi ceo rezultat (PDF)" opens the print dialog (window.print,
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
  await page.getByRole('button', { name: 'Izvezi ceo rezultat (PDF)' }).click()
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
  await expect(trucks.first().getByRole('heading', { level: 2 })).toHaveText('Šleper 1')
  expect(await trucks.evaluateAll((all) => all.map((t) => getComputedStyle(t).breakBefore))).toEqual(['page', 'page'])
  // Šleper 1: its start, three pickups and three deliveries (as on the results screen).
  await expect(trucks.first().locator('.report__stops').getByRole('row')).toHaveCount(1 + 1 + 6)
  await expect(trucks.first()).toContainText('Polazak')

  // The PDF Chromium makes of it: one page of summary and one per truck.
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(3)
  expect(errors).toEqual([])
})

test("prints a driver's PDF with that truck alone, then the whole report again", async ({ page }) => {
  const errors = collectPageErrors(page)
  // What the report holds at the moment of printing, since it goes back to the whole result after.
  await page.addInitScript(() => {
    const seen: Array<{ title: string; text: string; trucks: number }> = []
    ;(window as unknown as { printed: typeof seen }).printed = seen
    window.print = () => {
      const report = document.querySelector<HTMLElement>('[data-testid="result-report"]')!
      const trucks = report.querySelectorAll('.report__truck')
      seen.push({ title: document.title, text: report.textContent ?? '', trucks: trucks.length })
    }
  })
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Izmeni Šleper 1' }).click()
  await page.getByLabel('Ime vozača').fill('Marko Marković')
  await page.getByLabel('Telefon (za Viber)').fill('+381 64 123 4567')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni' })).toContainText('Marko Marković')

  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('1')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  const routes = page.getByRole('table', { name: 'Kamioni i rute' })
  await expect(routes).toBeVisible({ timeout: 30_000 })
  // The names of a truck's shipments, from its window.
  const shipmentsOf = async (truck: string) => {
    await routes.getByRole('button', { name: new RegExp(`pošiljk.*: ${truck}$`) }).click()
    const names = await page.getByRole('dialog').getByRole('rowheader').allInnerTexts()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    return names
  }
  const own = await shipmentsOf('Šleper 1')
  const others = await shipmentsOf('Šleper 2')

  await page.getByRole('button', { name: 'PDF za vozača: Šleper 1' }).click()
  const [printed] = await page.evaluate(() => (window as unknown as { printed: Array<{ title: string; text: string; trucks: number }> }).printed)
  expect(printed.title).toBe('rcva-Šleper-1-posao-1')
  expect(printed.trucks).toBe(1)
  expect(printed.text).toContain('Ruta i utovar')
  expect(printed.text).toContain('Vozač: Marko Marković, +381 64 123 4567')
  for (const label of own) expect(printed.text).toContain(label)
  // Nothing of the other truck, the totals or the summary.
  expect(printed.text).not.toContain('Šleper 2')
  for (const label of others) expect(printed.text).not.toContain(label)
  expect(printed.text).not.toContain('Rezultat optimizacije')
  expect(printed.text).not.toContain('Ukupna kilometraža')

  // Back to the whole result once printed.
  const report = page.getByTestId('result-report')
  await expect(report.locator('.report__truck')).toHaveCount(2)
  await expect(report.locator('h1')).toHaveText('Rezultat optimizacije')
  expect(errors).toEqual([])
})
