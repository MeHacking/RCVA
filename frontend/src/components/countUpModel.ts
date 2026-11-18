export const COUNT_UP_MS = 900

/**
 * The number shown `elapsedMs` into counting from `from` to `to` (CountUp): eased out (fast, then
 * slowing), whole numbers on the way, and exactly `to` at the end (and after it).
 */
export function countUpValue(from: number, to: number, elapsedMs: number, durationMs = COUNT_UP_MS): number {
  if (elapsedMs >= durationMs) return to
  const t = Math.max(0, elapsedMs) / durationMs
  const eased = 1 - (1 - t) ** 3
  return Math.round(from + (to - from) * eased)
}
