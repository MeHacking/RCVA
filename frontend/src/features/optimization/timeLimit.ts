/**
 * The time limit chosen in the step "Vreme", remembered in this browser, so "Pokreni optimizaciju"
 * in the top bar uses it too (before, the top bar always took 60 s).
 */
export const DEFAULT_TIME_LIMIT_SECONDS = 60
const KEY = 'rcva.timeLimit'

export function isTimeLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function loadTimeLimit(): number {
  try {
    const stored = Number(localStorage.getItem(KEY))
    return isTimeLimit(stored) ? stored : DEFAULT_TIME_LIMIT_SECONDS
  } catch {
    return DEFAULT_TIME_LIMIT_SECONDS
  }
}

export function saveTimeLimit(seconds: number): void {
  if (!isTimeLimit(seconds)) return
  try {
    localStorage.setItem(KEY, String(seconds))
  } catch {
    // Not kept (private window, blocked storage): it holds while the page is open.
  }
}

/** Seconds as said: "45 s", "2 min", "1 min 30 s" (for the dial's screen-reader text). */
export function spokenTime(s: number): string {
  if (!Number.isFinite(s)) return 'nije uneto'
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m === 0) return `${r} s`
  return r === 0 ? `${m} min` : `${m} min ${r} s`
}

/** "60", "  90 " -> seconds; anything else (empty, 0, decimals, letters) -> null */
export function parseTimeLimit(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const seconds = Number(trimmed)
  return isTimeLimit(seconds) ? seconds : null
}
