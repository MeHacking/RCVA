// The countries offered when a place is corrected or entered by hand. The user sees the name;
// the code is what is stored, and what Nominatim filters by (ISO 3166-1 alpha-2).
// Kosovo is not listed: OSM files it under its own code (xk), so a place there is not found
// under RS. With no country chosen it is looked up everywhere and found.

export interface Country {
  code: string
  name: string
}

/** In the order of the Serbian alphabet. */
export const COUNTRIES: readonly Country[] = [
  { code: 'AL', name: 'Albanija' },
  { code: 'AT', name: 'Austrija' },
  { code: 'BE', name: 'Belgija' },
  { code: 'BY', name: 'Belorusija' },
  { code: 'BA', name: 'Bosna i Hercegovina' },
  { code: 'BG', name: 'Bugarska' },
  { code: 'ME', name: 'Crna Gora' },
  { code: 'CZ', name: 'Češka' },
  { code: 'DK', name: 'Danska' },
  { code: 'EE', name: 'Estonija' },
  { code: 'FI', name: 'Finska' },
  { code: 'FR', name: 'Francuska' },
  { code: 'GR', name: 'Grčka' },
  { code: 'NL', name: 'Holandija' },
  { code: 'HR', name: 'Hrvatska' },
  { code: 'IE', name: 'Irska' },
  { code: 'IS', name: 'Island' },
  { code: 'IT', name: 'Italija' },
  { code: 'CY', name: 'Kipar' },
  { code: 'LV', name: 'Letonija' },
  { code: 'LI', name: 'Lihtenštajn' },
  { code: 'LT', name: 'Litvanija' },
  { code: 'LU', name: 'Luksemburg' },
  { code: 'HU', name: 'Mađarska' },
  { code: 'MT', name: 'Malta' },
  { code: 'MD', name: 'Moldavija' },
  { code: 'DE', name: 'Nemačka' },
  { code: 'NO', name: 'Norveška' },
  { code: 'PL', name: 'Poljska' },
  { code: 'PT', name: 'Portugalija' },
  { code: 'RO', name: 'Rumunija' },
  { code: 'RU', name: 'Rusija' },
  { code: 'MK', name: 'Severna Makedonija' },
  { code: 'SK', name: 'Slovačka' },
  { code: 'SI', name: 'Slovenija' },
  { code: 'RS', name: 'Srbija' },
  { code: 'ES', name: 'Španija' },
  { code: 'CH', name: 'Švajcarska' },
  { code: 'SE', name: 'Švedska' },
  { code: 'TR', name: 'Turska' },
  { code: 'UA', name: 'Ukrajina' },
  { code: 'GB', name: 'Velika Britanija' },
]

/** The standard form of a country as stored; the files write Bosnia as BIH. */
export function isoCountryCode(text: string): string {
  const code = text.trim().toUpperCase()
  return code === 'BIH' ? 'BA' : code
}

export const RECENT_COUNTRIES = 8

/** Fill the top of the list until enough countries have been chosen on this device. */
const USUAL_COUNTRIES = ['RS', 'SE', 'NO', 'BA', 'HR', 'DE', 'HU', 'MK']

const listed = (code: string) => COUNTRIES.find((c) => c.code === code)

/**
 * The choices for a stored country: the recently used ones on top, then the rest in order. A
 * stored country that is not on the list stays, so saving does not lose it.
 */
export function countryGroups(stored: string, recent: readonly string[]): { recent: Country[]; others: Country[] } {
  const top = [...new Set([...recent, ...USUAL_COUNTRIES])].flatMap((code) => listed(code) ?? []).slice(0, RECENT_COUNTRIES)
  const others = COUNTRIES.filter((c) => !top.includes(c))
  const code = isoCountryCode(stored)
  return { recent: top, others: !code || listed(code) ? others : [{ code, name: code }, ...others] }
}

/** The list after `code` was chosen: it comes first and appears once. */
export function withRecentCountry(recent: readonly string[], code: string): string[] {
  return [code, ...recent.filter((c) => c !== code)].slice(0, RECENT_COUNTRIES)
}
