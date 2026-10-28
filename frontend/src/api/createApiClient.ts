import { isScenarioName, SCENARIOS } from '../fixtures'
import { apiMode } from './apiMode'
import type { ApiClient } from './client'
import { createHttpClient } from './http/httpClient'
import { createMockApiClient } from './mock/mockClient'

/**
 * The single place that decides which ApiClient the app uses (see apiMode.ts): the
 * backend over HTTP in "server" mode, otherwise the in-browser mock with a fixture scenario.
 */
export function createApiClient(): ApiClient {
  if (apiMode() === 'server') return createHttpClient()
  const name = import.meta.env.VITE_MOCK_SCENARIO ?? 'small'
  if (!isScenarioName(name)) {
    throw new Error(`Unknown VITE_MOCK_SCENARIO "${name}". Allowed: ${Object.keys(SCENARIOS).join(', ')}`)
  }
  return createMockApiClient({ scenario: SCENARIOS[name] })
}
