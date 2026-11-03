import { expect, test } from '@playwright/test'
import { collectPageErrors } from '../consoleGuard.ts'

// The dashboard in the application on the device: a job uses only the trucks in the list,
// so too few of them is a warning, and so is a truck that does not know where it is.

test('warns about too few trucks, and about a truck without a location', async ({ page }) => {
  const errors = collectPageErrors(page)
  // Scenario "small": 20,9 LDM; Šleper 1 and 2 (13,6 LDM each) available, at the base.
  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Ukloni Šleper 1' }).click()
  await page.getByRole('button', { name: 'Da, ukloni' }).click()
  await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: /Šleper 1/ })).toBeHidden()

  await page.goto('/')
  const card = (title: string) => page.locator('.stat').filter({ has: page.getByText(title, { exact: true }) })
  const warnings = page.getByRole('region', { name: 'Upozorenja' })
  await expect(card('Kamioni')).toContainText('dostupno od 2 · 13,6 LDM')
  await expect(card('Kamioni')).not.toContainText('standardne cerade')
  await expect(warnings).toContainText('Ukupno 20,9 LDM je više od kapaciteta dostupnih kamiona (13,6 LDM).')

  await page.goto('/trucks')
  await page.getByRole('button', { name: 'Dodaj kamion' }).click()
  await page.getByLabel('Naziv').fill('Nova cerada')
  await page.getByLabel('Kapacitet (LDM)').fill('13.6')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await page.goto('/')
  await expect(warnings).toContainText('Kamioni bez lokacije: 1. Pre optimizacije unesite gde se nalaze.')
  await expect(warnings).not.toContainText('Ukupno 20,9 LDM')
  expect(errors).toEqual([])
})

test('counts the optimizations started, per day, week or month, with a tooltip on hover', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/optimization')
  await page.getByLabel('Vremensko ograničenje (s)').fill('1')
  await page.getByRole('main').getByRole('button', { name: 'Pokreni optimizaciju' }).first().click()
  await expect(page.getByRole('table', { name: 'Kamioni i rute' })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Pregled' }).click()
  const activity = page.getByRole('region', { name: 'Pokrenute optimizacije' })
  const rows = activity.getByRole('table', { name: 'Pokrenute optimizacije po periodima', includeHidden: true }).getByRole('row', { includeHidden: true })
  // Only from the day before the first job: yesterday (0) and today (1).
  await expect(rows).toHaveCount(1 + 2)
  await expect(rows.last()).toHaveText(/1$/, { useInnerText: false })
  await expect(activity).toContainText('Ukupno u prikazanom periodu: 1 optimizacija')

  // Hovering the right end shows today.
  const frame = activity.getByRole('group', { name: /^Pokrenute optimizacije po danima/ })
  await frame.scrollIntoViewIfNeeded()
  const box = (await frame.boundingBox())!
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2)
  const tooltip = activity.locator('.activity__tooltip')
  await expect(tooltip).toContainText('1 optimizacija')
  await expect(tooltip).toContainText(`${new Date().getDate()}.${new Date().getMonth() + 1}.${new Date().getFullYear()}.`)
  await page.mouse.move(box.x - 50, box.y - 50)
  await expect(tooltip).toHaveCount(0)

  // Proširi adds seven earlier days, Suzi takes them away again, never below two points.
  const narrow = activity.getByRole('button', { name: /^Suzi grafik/ })
  await expect(narrow).toBeDisabled()
  await activity.getByRole('button', { name: /^Proširi grafik/ }).click()
  await expect(rows).toHaveCount(1 + 9)
  await narrow.click()
  await expect(rows).toHaveCount(1 + 2)
  await expect(narrow).toBeDisabled()
  await activity.getByRole('button', { name: /^Proširi grafik/ }).click()

  // Another period starts again from the first job.
  await activity.getByRole('button', { name: 'Mesec' }).click()
  await expect(activity.getByRole('button', { name: 'Mesec' })).toHaveAttribute('aria-pressed', 'true')
  await expect(rows).toHaveCount(1 + 2)
  await expect(activity.getByRole('group', { name: /^Pokrenute optimizacije po mesecima/ })).toBeVisible()

  // The hidden table takes no room, however many periods it lists (a table alone ignores the
  // 1px box and lengthened the page below the sidebar).
  const hidden = await activity.locator('.visually-hidden').evaluate((e) => e.getBoundingClientRect().height)
  expect(hidden).toBeLessThanOrEqual(1)
  // Nothing reaches below the layout, so the page never scrolls past the sidebar.
  const heights = await page.evaluate(() => [document.documentElement.scrollHeight, document.querySelector('.app')!.getBoundingClientRect().height])
  expect(heights[0]).toBeLessThanOrEqual(Math.ceil(heights[1]))
  expect(errors).toEqual([])
})

test('pages the warnings that do not fit under the chart, and shows them all in one column', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.setViewportSize({ width: 1400, height: 900 })
  // Trucks of 1,0 LDM: every shipment is larger than any truck, a warning each.
  for (const truck of ['Šleper 1', 'Šleper 2']) {
    await page.goto('/trucks')
    await page.getByRole('button', { name: `Izmeni ${truck}` }).click()
    await page.getByLabel('Kapacitet (LDM)').fill('1')
    await page.getByRole('button', { name: 'Sačuvaj' }).click()
    await expect(page.getByRole('table', { name: 'Kamioni' }).getByRole('row', { name: new RegExp(truck) })).toContainText('1,0')
  }
  await page.goto('/')
  const warnings = page.getByRole('region', { name: 'Upozorenja' })
  const items = warnings.locator('ul.dashboard-warnings:not(.dashboard-warnings__measure) > li')
  const pager = warnings.getByText(/^Strana 1 od \d+$/)
  await expect(pager).toBeVisible()
  const pages = Number((await pager.textContent())!.match(/od (\d+)/)![1])
  const first = await items.allTextContents()
  expect(first.length).toBeGreaterThan(0)
  expect(first.length).toBeLessThan(6)
  await expect(warnings.getByRole('button', { name: '‹ Prethodna' })).toBeDisabled()

  // Every warning is on exactly one page.
  const seen = [...first]
  for (let p = 2; p <= pages; p++) {
    await warnings.getByRole('button', { name: 'Sledeća ›' }).click()
    await expect(warnings.getByText(`Strana ${p} od ${pages}`)).toBeVisible()
    seen.push(...(await items.allTextContents()))
  }
  await expect(warnings.getByRole('button', { name: 'Sledeća ›' })).toBeDisabled()
  expect(new Set(seen).size).toBe(seen.length)
  expect(seen.filter((t) => t.includes('je veća od najvećeg kamiona'))).toHaveLength(5)

  // The cards stay level: the chart under the warnings ends where the last job ends.
  const bottom = async (name: string) => {
    const box = (await page.getByRole('region', { name }).boundingBox())!
    return Math.round(box.y + box.height)
  }
  expect(await bottom('Pokrenute optimizacije')).toBe(await bottom('Poslednja optimizacija'))
  // The two cards above them are equally tall.
  const height = async (name: string) => Math.round((await page.getByRole('region', { name }).boundingBox())!.height)
  expect(await height('Pošiljke prema kamionima')).toBe(await height('Status pošiljki'))

  // In one column every warning shows, without pages.
  await page.setViewportSize({ width: 800, height: 900 })
  await expect(warnings.getByText(/^Strana \d+ od \d+$/)).toHaveCount(0)
  await expect(items).toHaveCount(seen.length)
  expect(errors).toEqual([])
})
