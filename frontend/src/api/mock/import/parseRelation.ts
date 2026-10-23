import type { PlaceGuess } from '../../types'

// Splits a free-text relation such as "NOVI SAD 34131 - LJUNGBY" or
// "NIS / RS / -/ SE / 55555 VAXJO" into pickup and delivery.
// Rules come from the real Excel file (Spec v2, section 1):
// - pickup and delivery are separated by the first hyphen (with or without spaces);
// - a postal code belongs to the DELIVERY place even when written next to the pickup
//   ("NOVI SAD 34131 - LJUNGBY": 34131 is Ljungby);
// - countries appear as "/ RS /" or as a code in front of the postal code ("NO 1234 DRAMMEN").
// The real implementation belongs to the backend; this one feeds the mock.

export interface RelationParse {
  pickup: PlaceGuess | null
  delivery: PlaceGuess | null
  /** blocking problems with the text itself (postal codes, several destinations) */
  issues: string[]
}

const COUNTRY_CODES = ['RS', 'SE', 'NO', 'MK', 'BIH', 'BA', 'HR', 'ME', 'SI', 'DK', 'DE', 'FI', 'HU', 'RO', 'BG']
const COUNTRY_TOKEN = new RegExp(`(?:^|[\\s/])(${COUNTRY_CODES.join('|')})(?=$|[\\s/])`, 'gi')
const NUMBER_TOKEN = /\d+/g
const VALID_POSTAL = /^\d{4,5}$/

export function parseRelation(text: string): RelationParse {
  const issues: string[] = []
  const normalized = text.replace(/\s+/g, ' ').trim()
  const separator = normalized.search(/[-–]/)
  const [left, right] = separator < 0 ? ['', normalized] : [normalized.slice(0, separator), normalized.slice(separator + 1)]

  const postalCodes = [...normalized.matchAll(NUMBER_TOKEN)].map((m) => m[0])
  for (const code of postalCodes.filter((c) => !VALID_POSTAL.test(c))) {
    issues.push(`Neispravan poštanski broj „${code}“ (očekuje se 4 ili 5 cifara).`)
  }
  const validCodes = postalCodes.filter((c) => VALID_POSTAL.test(c))
  if (validCodes.length > 1 || right.includes(',')) {
    issues.push('Više odredišta u jednoj relaciji; podelite ih na posebne redove ili ispravite ručno.')
  }

  // Missing places are reported by row validation, which also runs after corrections.
  const pickupName = placeName(left)
  const deliveryName = placeName(right)

  return {
    pickup: pickupName ? { name: pickupName, postalCode: null, country: countryOf(left) } : null,
    delivery: deliveryName
      ? { name: deliveryName, postalCode: validCodes.length === 1 ? validCodes[0] : null, country: countryOf(right) }
      : null,
    issues,
  }
}

/** Builds a place from separate pickup/delivery cells (no relation column). */
export function parsePlace(text: string, postalCode: string | null): PlaceGuess | null {
  const name = placeName(text)
  if (!name) return null
  const inText = (text.match(NUMBER_TOKEN) ?? []).find((c) => VALID_POSTAL.test(c)) ?? null
  return { name, postalCode: postalCode?.trim() || inText, country: countryOf(text) }
}

function countryOf(part: string): string | null {
  const match = [...part.matchAll(COUNTRY_TOKEN)].at(-1)
  return match ? match[1].toUpperCase() : null
}

/** Removes codes, numbers and separators, then writes the name in title case. */
function placeName(part: string): string {
  const cleaned = part
    .replace(COUNTRY_TOKEN, ' ')
    .replace(NUMBER_TOKEN, ' ')
    .replace(/[/,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned
    .toLocaleLowerCase('sr-Latn')
    .replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase('sr-Latn'))
}
