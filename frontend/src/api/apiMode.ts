/**
 * Where the data comes from, chosen at build time with VITE_API_MODE:
 * - "mock" (default): everything from the in-browser mock (src/api/mock), no backend needed;
 * - "server": everything from the backend (backend/, Spring Boot); VITE_MOCK_SCENARIO is ignored.
 */
export type ApiMode = 'mock' | 'server'

export function apiMode(): ApiMode {
  const value = import.meta.env.VITE_API_MODE ?? 'mock'
  if (value !== 'mock' && value !== 'server') {
    throw new Error(`Unknown VITE_API_MODE "${value}". Allowed: mock, server`)
  }
  return value
}

/** Shown in the sidebar, so probni podaci are never mistaken for real ones. */
export function apiModeLabel(mode: ApiMode): string {
  return mode === 'server'
    ? 'Podaci: server'
    : 'Probni podaci (bez servera)'
}
