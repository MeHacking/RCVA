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
  await expect(contents.getByRole('link')).toHaveText(chapters)
  for (const chapter of chapters) await expect(page.getByRole('region', { name: chapter })).toBeVisible()

  await contents.getByRole('link', { name: 'Kako radi optimizacija' }).click()
  await expect(page).toHaveURL(/#algoritam$/)
  const algorithm = page.getByRole('region', { name: 'Kako radi optimizacija' })
  await expect(algorithm).toBeInViewport()
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
