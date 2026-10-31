import { defineConfig, devices } from '@playwright/test'

// One dev server per mock scenario, and one for the application on the device
// (VITE_API_MODE=local) over "small". Ports differ from a manually started `npm run dev`
// (5173), so it is never reused by accident.
const SERVERS = {
  small: 5174,
  proven: 5175,
  notFound: 5176,
} as const
const LOCAL_PORT = 5177

const url = (port: number) => `http://localhost:${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  projects: [
    // Default data set; specs under scenarios/ need their own server.
    { name: 'chromium', testIgnore: ['scenarios/**', 'local/**'], use: { baseURL: url(SERVERS.small) } },
    // scenarios/<scenario>*.spec.ts runs against that scenario's server
    { name: 'scenario-proven', testMatch: 'scenarios/proven*.spec.ts', use: { baseURL: url(SERVERS.proven) } },
    { name: 'scenario-notFound', testMatch: 'scenarios/notFound*.spec.ts', use: { baseURL: url(SERVERS.notFound) } },
    { name: 'local', testMatch: 'local/**/*.spec.ts', use: { baseURL: url(LOCAL_PORT) } },
  ],
  // Dev server on purpose: StrictMode double-invokes effects only in development.
  webServer: [
    ...Object.entries(SERVERS).map(([scenario, port]) => ({ port, env: { VITE_MOCK_SCENARIO: scenario } })),
    { port: LOCAL_PORT, env: { VITE_API_MODE: 'local', VITE_MOCK_SCENARIO: 'small' } },
  ].map(({ port, env }) => ({
    command: `npm run dev -- --port ${port} --strictPort`,
    url: url(port),
    env,
    reuseExistingServer: false,
    timeout: 60_000,
  })),
})
