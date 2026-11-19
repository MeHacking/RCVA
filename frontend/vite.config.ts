import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // VITE_API_MODE=server: /api goes to the Spring Boot backend (backend/, port 8080)
  server: {
    // Not Vite's default 5173, so smartLoad can run at the same time; strictPort: fail
    // instead of moving to another port (the data on the device belongs to the address).
    // Playwright starts its own servers with --port (5174-5178).
    port: 5180,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: {
    // Unit tests cover pure logic only; UI (and WebGL) is tested with Playwright in tests/e2e.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // CSS is empty in unit tests, but for the tokens: theme.test.ts checks the contrast of each theme.
    css: { include: [/tokens\.css/] },
  },
})
