// A driver's phone number: as typed (and shown), and in the international form Viber wants.

// "+" or "00" and the country code, then digits with spaces, dashes, dots, slashes or
// brackets between them: "+381 64 123 4567", "00381 64/123-4567", "+46 (0)70 123 45 67".
const PHONE = /^(?:\+|00)[\d\s\-./()]+$/

/**
 * Parses a phone number with the country code; empty input is "not given" (null). The number
 * is kept as typed (spaces collapsed), since that is how the user reads it; anything else
 * (no country code, letters, too few or too many digits) is 'invalid'.
 */
export function parsePhone(input: string): string | null | 'invalid' {
  const text = input.trim().replace(/\s+/g, ' ')
  if (text === '') return null
  if (!PHONE.test(text)) return 'invalid'
  const digits = internationalPhone(text).slice(1)
  // E.164: at most 15 digits, and no country code starts with 0.
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return 'invalid'
  return text
}

/** "+381 64/123-4567" -> "+381641234567"; "(0)" after the country code is the trunk prefix, not dialled. */
export function internationalPhone(phone: string): string {
  const digits = phone.replace(/\(0\)/g, '').replace(/\D/g, '')
  return `+${phone.trim().startsWith('00') ? digits.slice(2) : digits}`
}
