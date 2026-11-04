import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The user guide in the application on the device: every chapter, reached from the menu
// and from its contents, with the parts only the device has.

test('explains the steps, the optimization, the tips and the messages', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Uputstvo' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Uputstvo' })).toBeVisible()

  const contents = page.getByRole('navigation', { name: 'Sadržaj uputstva' })
  const chapters = ['Ukratko', 'Kako se koristi, korak po korak', 'Kako radi optimizacija', 'Saveti za najbolje rezultate', 'Poruke i šta znače']
  await expect(contents.locator('.help__contents-chapters > li > a')).toHaveText(chapters)
  for (const chapter of chapters) await expect(page.getByRole('region', { name: chapter })).toBeVisible()
  // At first only the chapters; no subheadings.
  const usage = contents.getByRole('link', { name: 'Kako se koristi, korak po korak' })
  const optimization = contents.getByRole('link', { name: 'Kako radi optimizacija' })
  await expect(contents.getByRole('link')).toHaveCount(chapters.length)
  await expect(usage).toHaveAttribute('aria-expanded', 'false')
  await expect(contents.getByRole('link', { name: 'Ukratko' })).not.toHaveAttribute('aria-expanded')

  // The contents stay beside the text, and mark the part being read.
  await expect(contents.getByRole('link', { name: 'Ukratko' })).toHaveAttribute('aria-current', 'location')
  await optimization.click()
  await expect(page).toHaveURL(/#algoritam$/)
  const algorithm = page.getByRole('region', { name: 'Kako radi optimizacija' })
  await expect(algorithm).toBeInViewport()
  await expect(contents).toBeInViewport()
  await expect(optimization).toHaveAttribute('aria-current', 'location')
  await expect(contents.getByRole('link', { name: 'Ukratko' })).not.toHaveAttribute('aria-current')
  // The chapter clicked opens its subheadings.
  await expect(optimization).toHaveAttribute('aria-expanded', 'true')
  await contents.getByRole('link', { name: 'Preporuka dodatnog kamiona' }).click()
  await expect(page).toHaveURL(/#preporuka-dodatnog-kamiona$/)
  await expect(contents.getByRole('link', { name: 'Preporuka dodatnog kamiona' })).toHaveAttribute('aria-current', 'location')
  // Every chapter and subheading has its own id (the chapter "Kako se koristi" once shared
  // "koraci" with the subheading "Koraci", and the wrong part was marked).
  const ids = await page.locator('.help [id]').evaluateAll((all) => all.map((e) => e.id))
  expect(new Set(ids).size).toBe(ids.length)

  // One chapter open at a time: another one closes it, and shows its own (device-only too).
  await usage.click()
  await expect(usage).toHaveAttribute('aria-current', 'location')
  await expect(usage).toHaveAttribute('aria-expanded', 'true')
  await expect(optimization).toHaveAttribute('aria-expanded', 'false')
  await expect(contents.getByRole('link', { name: 'Preporuka dodatnog kamiona' })).toHaveCount(0)
  await expect(contents.getByRole('link', { name: '6. Podešavanja i podaci na uređaju' })).toBeVisible()

  // Both chapters with parts number them in order, the same in the text and in the contents.
  const usageParts = [
    'Uvoz pošiljki iz Excel-a',
    'Provera pošiljki',
    'Kamioni',
    'Pokretanje optimizacije',
    'Rezultat',
    'Podešavanja i podaci na uređaju',
  ]
  const optimizationParts = [
    'Pravila koja svako rešenje poštuje',
    'Koraci',
    'Preporuka dodatnog kamiona',
    'Kilometraže',
    'Šta optimizacija ne garantuje',
  ]
  const numbered = (parts: string[]) => parts.map((part, i) => `${i + 1}. ${part}`)
  const headings = (chapter: string) =>
    page.getByRole('region', { name: chapter }).getByRole('heading', { level: 3 }).evaluateAll((all) =>
      // The accessible text: the number with its hidden full stop, then the title.
      all.map((h) => (h.textContent ?? '').replace(/^(\d+)\. ?/, '$1. ')),
    )
  expect(await headings('Kako se koristi, korak po korak')).toEqual(numbered(usageParts))
  expect(await headings('Kako radi optimizacija')).toEqual(numbered(optimizationParts))
  await expect(contents.locator('.help__contents-sub a')).toHaveText(numbered(usageParts))
  await optimization.click()
  await expect(contents.locator('.help__contents-sub a')).toHaveText(numbered(optimizationParts))
  await usage.click()
  // While its subheadings are closed, a chapter stands for the part being read inside it.
  await contents.getByRole('link', { name: 'Ukratko' }).click()
  await expect(contents.getByRole('link', { name: '1. Uvoz pošiljki iz Excel-a' })).toHaveCount(0)
  await page.evaluate(() => document.getElementById('preporuka-dodatnog-kamiona')!.scrollIntoView({ block: 'start' }))
  await expect(optimization).toHaveAttribute('aria-current', 'location')
  await expect(algorithm.getByRole('heading', { name: 'Preporuka dodatnog kamiona' })).toBeVisible()
  await expect(algorithm).toContainText('Do 9 pošiljki po kamionu to je tačno najkraći redosled')

  // Device-only parts, and the exact wording of the messages on the other screens.
  await expect(page.getByRole('region', { name: 'Kako se koristi, korak po korak' })).toContainText('„Gde su kamioni?“')
  const messages = page.getByRole('region', { name: 'Poruke i šta znače' })
  await expect(messages).toContainText('Solver nije našao rešenje u zadatom vremenu. To ne znači da rešenje ne postoji.')
  await expect(messages).toContainText('Kamioni bez potvrđene lokacije')
  await expect(page.getByText('Aplikacija sada ne radi na uređaju')).toHaveCount(0)

  // The links lead to the screens.
  await page.getByRole('region', { name: 'Kako se koristi, korak po korak' }).getByRole('link', { name: 'Kamioni' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Kamioni' })).toBeVisible()
  expect(errors).toEqual([])
})
