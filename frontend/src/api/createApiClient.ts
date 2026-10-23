import { isScenarioName, SCENARIOS } from '../fixtures'
import type { ApiClient } from './client'
import { createMockApiClient } from './mock/mockClient'

/**
 * The single place that decides which ApiClient the app uses. For now always the mock;
 * the HTTP client for the Spring Boot backend replaces it here.
 */
export function createApiClient(): ApiClient {
  const name = import.meta.env.VITE_MOCK_SCENARIO ?? 'small'
  if (!isScenarioName(name)) {
    throw new Error(`Unknown VITE_MOCK_SCENARIO "${name}". Allowed: ${Object.keys(SCENARIOS).join(', ')}`)
  }
  return createMockApiClient({ scenario: SCENARIOS[name] })
}
