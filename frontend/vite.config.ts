import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Unit tests cover pure logic only; UI (and WebGL) is tested with Playwright in tests/e2e.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
