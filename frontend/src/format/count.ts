// Counts with the noun in the right Serbian form.

/** 1, 21, 101 -> one; 2–4, 22–24 -> few; the rest (and 11–14) -> many */
export function plural(n: number, one: string, few: string, many: string): string {
  const tens = n % 100
  const units = n % 10
  if (units === 1 && tens !== 11) return one
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return few
  return many
}

/** "1 pošiljka", "3 pošiljke", "5 pošiljki" */
export function formatShipmentCount(n: number): string {
  return `${n} ${plural(n, 'pošiljka', 'pošiljke', 'pošiljki')}`
}
