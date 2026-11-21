/**
 * The time limit chosen in the step "Vreme", remembered in this browser, so "Pokreni optimizaciju"
 * in the top bar uses it too (before, the top bar always took 60 s).
 */
export const DEFAULT_TIME_LIMIT_SECONDS = 60
const KEY = 'rcva.timeLimit'

export function isTimeLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** The time the user chose in the step "Vreme"; null while they have not chosen one. */
export function storedTimeLimit(): number | null {
  try {
    const raw = localStorage.getItem(KEY)
    const stored = raw === null ? Number.NaN : Number(raw)
    return isTimeLimit(stored) ? stored : null
  } catch {
    return null
  }
}

/**
 * The time recommended for this many shipments (owner, 21.11.2026: users may give the solver too
 * little time). Measured on 21.11.2026 on invented jobs shaped like the owner's (pickups in a few
 * Balkan cities, deliveries over Sweden and Norway, standard curtain trucks), on a fast 8-core PC:
 * up to 10 shipments the best answer comes at once; 20-40 need about 10 s (with less, sometimes one
 * truck more); 50 settle after 20-40 s: twice that, for slower computers. 75 and 100 shipments still
 * improve up to 180 s (one job of 75 found a truck fewer only then): the measured times, without
 * the margin (it would be 6 minutes), and even they are no guarantee.
 */
export function recommendedTimeLimit(shipments: number): number {
  if (shipments <= 10) return 10
  if (shipments <= 30) return 20
  if (shipments <= 50) return 40
  if (shipments <= 75) return 120
  return 180
}

/** "Optimizuj" in the top bar, where no warning is seen: the chosen time, but never less than recommended. */
export function topBarTimeLimit(shipments: number): number {
  return Math.max(storedTimeLimit() ?? 0, recommendedTimeLimit(shipments))
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
