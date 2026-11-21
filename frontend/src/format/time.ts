/** ISO 8601 timestamp -> local "HH:MM:SS"; null stays "–". */
export function formatTime(iso: string | null): string {
  if (!iso) return '–'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '–'
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}

/** ISO 8601 timestamp -> local "DD.MM.GGGG. HH:MM"; null or a bad value stays "–". */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '–'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '–'
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}. ${two(date.getHours())}:${two(date.getMinutes())}`
}

/** Whole seconds -> "m:ss" (12 -> "0:12", 600 -> "10:00"), as on a stopwatch; below 0 is 0. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

const MONTHS =['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']

/** A local date -> "3.11." (day and month, as on chart axes) */
export function formatDayMonth(date: Date): string {
  return `${date.getDate()}.${date.getMonth() + 1}.`
}

/** A local date -> "3.11.2026." */
export function formatDate(date: Date): string {
  return `${formatDayMonth(date)}${date.getFullYear()}.`
}

/** A local date -> "nov 2026" */
export function formatMonthYear(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** A local date -> "nov" */
export function formatMonth(date: Date): string {
  return MONTHS[date.getMonth()]
}
