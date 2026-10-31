import { isScenarioName, SCENARIOS } from '../fixtures'
import { apiMode } from './apiMode'
import type { ApiClient } from './client'
import { runInWorker } from '../domain/optimization/solverRunner'
import { createHttpClient } from './http/httpClient'
import { createIndexedDbStore } from './local/deviceStore'
import { createLocalApiClient, type LocalData } from './local/localClient'
import { createMockApiClient } from './mock/mockClient'

/**
 * The single place that decides which ApiClient the app uses (see apiMode.ts): the
 * backend over HTTP in "server" mode, otherwise a fixture scenario, either in the mock or
 * as the starting data of the application on the device ("local", kept in IndexedDB).
 */
export function createApiClient(): ApiClient {
  if (apiMode() === 'server') return createHttpClient()
  const name = import.meta.env.VITE_MOCK_SCENARIO ?? 'small'
  if (!isScenarioName(name)) {
    throw new Error(`Unknown VITE_MOCK_SCENARIO "${name}". Allowed: ${Object.keys(SCENARIOS).join(', ')}`)
  }
  const scenario = SCENARIOS[name]
  return apiMode() === 'local'
    ? createLocalApiClient({ scenario, runSolver: runInWorker, store: createIndexedDbStore<LocalData>() })
    : createMockApiClient({ scenario })
}
