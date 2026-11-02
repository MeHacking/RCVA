// Coordinates entered by hand and shown next to a place (latitude, longitude in degrees).

export interface Coordinates {
  lat: number
  lon: number
}

// Two numbers, each with a decimal point or a decimal comma, separated by a comma, a
// semicolon or spaces: "45.2671, 19.8335" (as Google Maps copies them), "45,2671 19,8335".
const PAIR = /^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/

/**
 * Parses "latitude, longitude"; empty input is "not given" (null). Anything else that is
 * not two numbers in range is 'invalid'.
 */
export function parseCoordinates(input: string): Coordinates | null | 'invalid' {
  if (input.trim() === '') return null
  const match = PAIR.exec(input)
  if (!match) return 'invalid'
  const [lat, lon] = [match[1], match[2]].map((n) => Number(n.replace(',', '.')))
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'invalid'
  return { lat, lon }
}

/** { lat: 45.2671, lon: -19.8 } -> "45,26710° N, 19,80000° W" (5 decimals: about 1 m) */
export function formatCoordinates({ lat, lon }: Coordinates): string {
  const degrees = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(5).replace('.', ',')}° ${value < 0 ? negative : positive}`
  return `${degrees(lat, 'N', 'S')}, ${degrees(lon, 'E', 'W')}`
}
