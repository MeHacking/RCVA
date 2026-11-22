import type { Page } from '@playwright/test'

/** Collects console errors and uncaught exceptions; tests assert the list stays empty. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  // "Rezultat nije sačuvan…" before a new job: a test that starts again goes on, as a user who does
  // not keep the result; any other dialog is dismissed, as Playwright does without a listener.
  page.on('dialog', (dialog) => void (dialog.message().startsWith('Rezultat nije sačuvan') ? dialog.accept() : dialog.dismiss()))
  return errors
}
