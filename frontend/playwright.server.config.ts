import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// End-to-end against the real backend: starts Spring Boot (backend/, port 8080) and the
// dev server in VITE_API_MODE=server. Needs Java 21. Run: npm run test:e2e:server
const PORT = 5177
const backendDir = resolve(import.meta.dirname, '../backend')
// Absolute path: cmd.exe does not find a bare "mvnw.cmd" in the working directory.
const mavenWrapper = `"${resolve(backendDir, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw')}"`

export default defineConfig({
  testDir: 'tests/e2e-server',
  fullyParallel: false, // tests share one backend with in-memory data
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `${mavenWrapper} -q spring-boot:run`,
      cwd: backendDir,
      url: 'http://localhost:8080/api/v1/health',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      env: { VITE_API_MODE: 'server' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
