/**
 * Where the data comes from, chosen at build time with VITE_API_MODE:
 * - "mock" (default): everything from the in-browser mock (src/api/mock), no backend needed;
 *   every job ends with the scenario's fixed outcome;
 * - "local": the application on the device (src/api/local): the scenario's data as a start,
 *   and jobs really solved in the browser (path B);
 * - "server": everything from the backend (backend/, Spring Boot); VITE_MOCK_SCENARIO is ignored.
 */
export type ApiMode = 'mock' | 'local' | 'server'

export function apiMode(): ApiMode {
  const value = import.meta.env.VITE_API_MODE ?? 'mock'
  if (value !== 'mock' && value !== 'local' && value !== 'server') {
    throw new Error(`Unknown VITE_API_MODE "${value}". Allowed: mock, local, server`)
  }
  return value
}

/** Shown in the sidebar, so probni podaci are never mistaken for real ones. */
export function apiModeLabel(mode: ApiMode): string {
  if (mode === 'server') return 'Podaci: server'
  if (mode === 'local') return 'Na uređaju (probni početni podaci)'
  return 'Probni podaci (bez servera)'
}
