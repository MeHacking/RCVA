/**
 * Where the data comes from, chosen at build time with VITE_API_MODE:
 * - "mock" (default): everything from the in-browser mock (src/api/mock), no backend needed;
 * - "server": trucks and base from the backend, everything else still from the mock until
 *   the backend serves it (shipments stay on the mock because the Excel import writes there).
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
    ? 'Kamioni: server · ostalo: probni podaci'
    : 'Probni podaci (bez servera)'
}
