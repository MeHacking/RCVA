/** ISO 8601 timestamp -> local "HH:MM:SS"; null stays "–". */
export function formatTime(iso: string | null): string {
  if (!iso) return '–'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '–'
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}
