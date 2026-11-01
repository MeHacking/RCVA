import { defineConfig } from '@playwright/test'

// The desktop application (Electron) over the copied web build (electron/web/). Run:
// npm run test:desktop (builds and copies first). Each test starts the application itself.
export default defineConfig({
  testDir: 'tests/desktop',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
})
