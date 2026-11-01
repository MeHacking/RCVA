import { isScenarioName, SCENARIOS } from '../fixtures'
import { apiMode, startingScenario } from './apiMode'
import type { ApiClient } from './client'
import { runInWorker } from '../domain/optimization/solverRunner'
import { createHttpClient } from './http/httpClient'
import { createIndexedDbStore } from './local/deviceStore'
import { createLocalApiClient, EMPTY_START, type LocalData } from './local/localClient'
import { createMockApiClient } from './mock/mockClient'

/**
 * The single place that decides which ApiClient the app uses (see apiMode.ts): the
 * application on the device ("local", kept in IndexedDB; empty or a fixture scenario as the
 * start), the mock over a fixture scenario, or the backend over HTTP ("server").
 */
export function createApiClient(): ApiClient {
  const mode = apiMode()
  if (mode === 'server') return createHttpClient()
  const name = startingScenario(mode)
  if (name !== null && !isScenarioName(name)) {
    throw new Error(`Unknown VITE_MOCK_SCENARIO "${name}". Allowed: ${Object.keys(SCENARIOS).join(', ')}`)
  }
  const scenario = name === null ? null : SCENARIOS[name]
  if (mode === 'local') {
    return createLocalApiClient({ scenario: scenario ?? EMPTY_START, runSolver: runInWorker, store: createIndexedDbStore<LocalData>() })
  }
  return createMockApiClient({ scenario: scenario ?? SCENARIOS.small })
}
