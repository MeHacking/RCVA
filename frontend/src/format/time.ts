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
