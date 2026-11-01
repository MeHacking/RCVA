/**
 * Where the data comes from, chosen at build time with VITE_API_MODE:
 * - "local" (default): the application on the device (src/api/local): data kept in the
 *   browser, jobs really solved there (path B); it starts empty, or from the fixture
 *   scenario VITE_MOCK_SCENARIO when one is given (development and tests);
 * - "mock": everything from the in-browser mock (src/api/mock), no backend needed; every job
 *   ends with the scenario's fixed outcome (VITE_MOCK_SCENARIO, default "small");
 * - "server": everything from the backend (backend/, Spring Boot); VITE_MOCK_SCENARIO is ignored.
 */
export type ApiMode = 'mock' | 'local' | 'server'

export function apiMode(): ApiMode {
  const value = import.meta.env.VITE_API_MODE ?? 'local'
  if (value !== 'mock' && value !== 'local' && value !== 'server') {
    throw new Error(`Unknown VITE_API_MODE "${value}". Allowed: mock, local, server`)
  }
  return value
}

/**
 * The fixture scenario the data starts from: VITE_MOCK_SCENARIO, else "small" for the mock;
 * null when there is none (the application on the device then starts empty; the backend has
 * its own data).
 */
export function startingScenario(mode: ApiMode = apiMode()): string | null {
  if (mode === 'server') return null
  return import.meta.env.VITE_MOCK_SCENARIO ?? (mode === 'mock' ? 'small' : null)
}

/** Shown in the sidebar, so probni podaci are never mistaken for real ones. */
export function apiModeLabel(mode: ApiMode, sampleData = startingScenario(mode) !== null): string {
  if (mode === 'server') return 'Podaci: server'
  if (mode === 'local') return sampleData ? 'Na uređaju (probni početni podaci)' : 'Na uređaju'
  return 'Probni podaci (bez servera)'
}
