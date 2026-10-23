// Stand-in for geocoding: the mock "finds" only these places. Everything else is stored
// with geocodeStatus FAILED, which the shipments table shows as "Nejasna lokacija".
// Coordinates are approximate city centres.

const PLACES: Record<string, readonly [number, number]> = {
  beograd: [44.8125, 20.4612],
  subotica: [46.1003, 19.6658],
  kragujevac: [44.0128, 20.9114],
  leskovac: [42.9981, 21.9461],
  'novi sad': [45.2671, 19.8335],
  nis: [43.3209, 21.8958],
  ljungby: [56.8333, 13.9333],
  stenkullen: [57.792, 12.317],
  landskrona: [55.8708, 12.8302],
  malmo: [55.605, 13.0038],
  goteborg: [57.7089, 11.9746],
  jonkoping: [57.7826, 14.1618],
}

export function geocode(name: string): readonly [number, number] | null {
  return PLACES[normalizePlaceName(name)] ?? null
}

/** Lower case without diacritics: "Niš" -> "nis", "Göteborg" -> "goteborg" */
export function normalizePlaceName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'dj')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
