import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { collectPageErrors } from './consoleGuard.ts'

// Default mock scenario "small": 5 shipments, 20,9 LDM in total, all locations geocoded.

test('lists shipments with totals and status', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/shipments')

  const table = page.getByRole('table', { name: 'Pošiljke' })
  await expect(table.getByRole('row')).toHaveCount(6) // header + 5
  await expect(page.getByText(/Pošiljki: 5 · ukupno 20,9 LDM · sa greškom: 0/)).toBeVisible()

  const s103 = table.getByRole('row', { name: /S-103/ })
  await expect(s103).toContainText('Kragujevac')
  await expect(s103).toContainText('Stenkullen')
  await expect(s103).toContainText('44361')
  await expect(s103).toContainText('6,0')
  await expect(s103).toContainText('6000 × 2400 × 2200 mm')
  await expect(s103).toContainText('U redu')
  await expect(table.getByRole('row', { name: /S-101/ })).toContainText('nije uneto')
  expect(errors).toEqual([])
})

test('exports a UTF-8 CSV that Excel opens with Serbian settings', async ({ page }) => {
  await page.goto('/shipments')
  await expect(page.getByRole('table', { name: 'Pošiljke' })).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Izvezi CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^posiljke-\d{4}-\d{2}-\d{2}\.csv$/)

  const content = await readFile(await download.path(), 'utf8')
  expect(content.startsWith('﻿')).toBe(true)
  const lines = content.slice(1).split('\r\n')
  expect(lines[0]).toContain('ID;Preuzimanje;Isporuka')
  expect(lines[1]).toBe('S-101;Subotica;Ljungby;34131;4,0;3200;;;;U redu')
  expect(lines.filter(Boolean)).toHaveLength(6)
})
