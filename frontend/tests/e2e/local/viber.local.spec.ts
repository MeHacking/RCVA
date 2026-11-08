import { expect, test, type Page } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// "Viber" in a truck's row: the driver's PDF and the Viber chat with the driver. In the
// browser the PDF goes through the print dialog and the chat opens by a viber:// link; both
// are faked here (the print dialog cannot be answered, and there is no Viber).

async function fakePrintAndViber(page: Page) {
  await page.addInitScript(() => {
    const seen = { printed: [] as Array<{ title: string; trucks: number; text: string }>, opened: [] as string[] }
    ;(window as unknown as { seen: typeof seen }).seen = seen
    window.print = () => {
      const report = document.querySelector('[data-testid="result-report"]')!
      seen.printed.push({ title: document.title, trucks: report.querySelectorAll('.report__truck').length, text: report.textContent ?? '' })
    }
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith('viber:')) seen.opened.push(this.href)
      else click.call(this)
    }
  })
}

const seen = (page: Page) =>
  page.evaluate(() => (window as unknown as { seen: { printed: Array<{ title: string; trucks: number; text: string }>; opened: string[] } }).seen)

async function solve(page: Page) {
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('1')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 30_000 })
}

test("sends the driver's PDF to the chat with the driver's number", async ({ page }) => {
  const errors = collectPageErrors(page)
  await fakePrintAndViber(page)
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Izmeni Šleper 1' }).click()
  await page.getByLabel('Telefon (za Viber)').fill('+381 64 123 4567')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni' })).toContainText('+381 64 123 4567')

  await solve(page)
  await page.getByRole('button', { name: 'Pošalji na Viber: Šleper 1' }).click()
  await expect(page.getByText('Sačuvajte PDF u prozoru za štampu, pa ga priložite u Viber razgovoru sa +381 64 123 4567.')).toBeVisible()
  const { printed, opened } = await seen(page)
  // Only that truck's part, then the chat with its driver.
  expect(printed).toHaveLength(1)
  expect(printed[0]).toMatchObject({ title: 'rcva-Šleper-1-posao-1', trucks: 1 })
  expect(printed[0].text).not.toContain('Šleper 2')
  expect(opened).toEqual(['viber://chat?number=%2B381641234567'])
  expect(errors).toEqual([])
})

test('asks for the number of a driver without one, keeps it on the truck, then sends', async ({ page }) => {
  const errors = collectPageErrors(page)
  await fakePrintAndViber(page)
  await solve(page)

  await page.getByRole('button', { name: 'Pošalji na Viber: Šleper 2' }).click()
  const dialog = page.getByRole('dialog', { name: 'Broj telefona vozača' })
  await expect(dialog).toContainText('Kamion Šleper 2 nema broj telefona vozača')
  await expect(dialog.getByLabel('Telefon vozača (za Viber)')).toBeFocused()

  // Without the country code it is not taken, and nothing is sent.
  await dialog.getByLabel('Telefon vozača (za Viber)').fill('064 765 4321')
  await dialog.getByRole('button', { name: 'Sačuvaj i pošalji' }).click()
  await expect(dialog.getByText('Unesite broj sa pozivnim brojem zemlje, npr. +381 64 123 4567.')).toBeVisible()
  expect((await seen(page)).printed).toEqual([])

  // "Otkaži" leaves the truck as it was.
  await dialog.getByRole('button', { name: 'Otkaži' }).click()
  await expect(dialog).toHaveCount(0)
  expect((await seen(page)).printed).toEqual([])

  await page.getByRole('button', { name: 'Pošalji na Viber: Šleper 2' }).click()
  await dialog.getByLabel('Telefon vozača (za Viber)').fill('+46 70 123 45 67')
  await dialog.getByRole('button', { name: 'Sačuvaj i pošalji' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('priložite u Viber razgovoru sa +46 70 123 45 67.')).toBeVisible()
  const { printed, opened } = await seen(page)
  expect(printed.map((p) => p.title)).toEqual(['rcva-Šleper-2-posao-1'])
  expect(opened).toEqual(['viber://chat?number=%2B46701234567'])

  // Kept on the truck: the next time no question.
  await page.getByRole('button', { name: 'Pošalji na Viber: Šleper 2' }).click()
  await expect.poll(async () => (await seen(page)).opened.length).toBe(2)
  await expect(dialog).toHaveCount(0)
  await page.goto('/trucks')
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: /Šleper 2/ })).toContainText('+46 70 123 45 67')
  expect(errors).toEqual([])
})
