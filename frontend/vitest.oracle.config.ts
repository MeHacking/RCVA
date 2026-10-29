import { defineConfig } from 'vitest/config'

// npm run test:oracle: the TypeScript solver against Timefold's results
// (tests/oracle/timefold.json, written by backend TimefoldOracleTest). Slow, so it is
// kept out of npm test.
export default defineConfig({
  test: {
    include: ['tests/oracle/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30 * 60 * 1000,
  },
})
