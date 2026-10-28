import { isScenarioName, SCENARIOS } from '../fixtures'
import { apiMode } from './apiMode'
import type { ApiClient } from './client'
import { createHttpClient } from './http/httpClient'
import { createMockApiClient } from './mock/mockClient'

/**
 * The single place that decides which ApiClient the app uses (see apiMode.ts).
 * In "server" mode the calls the backend already serves go over HTTP; the rest stay on
 * the mock and are replaced here one by one as the backend grows.
 */
export function createApiClient(): ApiClient {
  const name = import.meta.env.VITE_MOCK_SCENARIO ?? 'small'
  if (!isScenarioName(name)) {
    throw new Error(`Unknown VITE_MOCK_SCENARIO "${name}". Allowed: ${Object.keys(SCENARIOS).join(', ')}`)
  }
  const mock = createMockApiClient({ scenario: SCENARIOS[name] })
  return apiMode() === 'server' ? { ...mock, ...createHttpClient() } : mock
}
