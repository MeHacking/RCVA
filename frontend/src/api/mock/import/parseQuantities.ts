// Weight and LDM cells as written in the Excel file: "4,200 kg", "5,3t", "500kg", "2,4m", "3.6m".

export interface ParsedWeight {
  kg: number | null
  /** weight is informative only, so problems are warnings, never errors */
  warning: string | null
}

/**
 * "4,200 kg" -> 4200 (comma as thousands separator for kg, as confirmed for this file),
 * "5,3t" -> 5300 (comma as decimal for tonnes), "500kg" -> 500.
 */
export function parseWeight(text: string): ParsedWeight {
  const compact = text.replace(/\s+/g, '').toLowerCase()
  if (compact === '') return { kg: null, warning: null }

  const match = /^(\d[\d.,]*)(kg|t)?$/.exec(compact)
  if (!match) return { kg: null, warning: `Težina „${text}“ nije prepoznata.` }
  const [, number, unit] = match

  if (unit === 't') {
    if (!/^\d+([.,]\d+)?$/.test(number)) return { kg: null, warning: `Težina „${text}“ nije prepoznata.` }
    return { kg: Math.round(Number(number.replace(',', '.')) * 1000), warning: null }
  }

  const warningNoUnit = unit ? null : `Težina „${text}“ nema jedinicu; pretpostavljeni su kilogrami.`
  if (/^\d{1,3}(,\d{3})+$/.test(number)) return { kg: Number(number.replace(/,/g, '')), warning: warningNoUnit }
  if (/^\d+$/.test(number)) return { kg: Number(number), warning: warningNoUnit }
  if (/^\d+[.,]\d+$/.test(number)) {
    return {
      kg: Number(number.replace(',', '.')),
      warning: `Zarez u težini „${text}“ ne liči na hiljade; protumačeno kao decimala. Proverite.`,
    }
  }
  return { kg: null, warning: `Težina „${text}“ nije prepoznata.` }
}

/** "2,4m" / "3.6m" / "1m" / "2,4" -> LDM x 10; null if not a number with at most one decimal. */
export function parseLdmCell(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d))?\s*(?:m|ldm)?$/i.exec(text.trim())
  if (!match) return null
  return Number(match[1]) * 10 + Number(match[2] ?? '0')
}
