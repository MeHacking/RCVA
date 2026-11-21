/**
 * The search in the top bar (as in smartLoad+, owner 21.11.2026): every word typed must be found
 * somewhere in the row, without regard to case or diacritics ("sleper" finds "Šleper").
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function matchesQuery(query: string, parts: ReadonlyArray<string | number | null | undefined>): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = normalize(parts.filter((p) => p !== null && p !== undefined).join(' '))
  return words.every((word) => text.includes(word))
}
