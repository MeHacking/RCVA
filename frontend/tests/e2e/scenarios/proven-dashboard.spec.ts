import { expect, test } from '@playwright/test'

// Mock scenario "proven": the dashboard warns before the job is even started.

test('dashboard shows the oversized shipment as a danger warning', async ({ page }) => {
  await page.goto('/')
  const warnings = page.getByRole('region', { name: 'Upozorenja' })
  await expect(warnings).toContainText(
    'Pošiljka S-401 (14,0 LDM) je veća od najvećeg dostupnog kamiona (13,6 LDM).',
  )
  await expect(page.locator('.stat').filter({ hasText: 'Ukupno LDM' })).toContainText('dostupni kamioni nisu dovoljni')
})
