import { normalizePlaceName } from '../mock/import/gazetteer'

// Coordinates from the public Nominatim (OpenStreetMap), under its usage policy
// (https://operations.osmfoundation.org/policies/nominatim/):
// - at most one request per second for the whole application (one geocoder per app);
// - every answer, also "not found", is kept on the device by the caller and never asked
//   again (see `placeKey`); only a failed request may be repeated, on the next import;
// - requests only when the user commits an import, never while typing;
// - it can be switched off in the settings, without a new version;
// - "© OpenStreetMap contributors" is shown where the coordinates are used.
// A web page cannot set its own User-Agent, so the browser's Referer identifies the
// application, together with the contact e-mail from the settings when there is one.

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors'

export interface PlaceQuery {
  name: string
  /** country code as written in the file (RS, SE, BIH...); null when unknown */
  country: string | null
}

export type GeocodeAnswer = { found: true; lat: number; lon: number; label: string } | { found: false }

export class GeocodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'GeocodeError'
  }
}

export interface Geocoder {
  /** Rejects with GeocodeError when Nominatim cannot be asked or does not answer properly. */
  geocode(query: PlaceQuery): Promise<GeocodeAnswer>
}

/** The cache key: the same name in the same country is the same query (postal codes are not sent). */
export function placeKey(query: PlaceQuery): string {
  return `${normalizePlaceName(query.name)}|${countryCode(query.country) ?? ''}`
}

/** ISO 3166-1 alpha-2 for Nominatim's `countrycodes`; the files write Bosnia as BIH. */
function countryCode(country: string | null): string | null {
  if (!country) return null
  const code = country.trim().toLowerCase()
  if (code === 'bih') return 'ba'
  return /^[a-z]{2}$/.test(code) ? code : null
}

export interface NominatimOptions {
  fetch: typeof fetch
  /** read for every request, so a change in the settings applies at once */
  contactEmail: () => string | null
  minIntervalMs?: number
  now?: () => number
  wait?: (ms: number) => Promise<void>
}

export function createNominatimGeocoder(options: NominatimOptions): Geocoder {
  const {
    fetch: fetchImpl,
    contactEmail,
    minIntervalMs = 1000,
    now = () => Date.now(),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options
  // One request at a time, and the next one starts at least minIntervalMs after the last.
  let turn: Promise<unknown> = Promise.resolve()
  let lastStart = -Infinity

  async function ask(query: PlaceQuery): Promise<GeocodeAnswer> {
    const delay = lastStart + minIntervalMs - now()
    if (delay > 0) await wait(delay)
    lastStart = now()
    const response = await fetchImpl(searchUrl(query, contactEmail()), { headers: { Accept: 'application/json' } }).catch(
      (error: unknown) => {
        throw new GeocodeError('Nominatim nije dostupan (nema veze sa internetom ili je zahtev odbijen).', { cause: error })
      },
    )
    if (!response.ok) {
      throw new GeocodeError(
        response.status === 429 || response.status === 403
          ? `Nominatim je odbio zahtev (HTTP ${response.status}); previše upita, pokušajte kasnije.`
          : `Nominatim nije odgovorio kako treba (HTTP ${response.status}).`,
      )
    }
    return parse(await response.json().catch(() => null))
  }

  return {
    geocode(query) {
      const result = turn.then(() => ask(query))
      turn = result.catch(() => undefined)
      return result
    },
  }
}

export function searchUrl(query: PlaceQuery, email: string | null): string {
  const params = new URLSearchParams({ q: query.name, format: 'jsonv2', limit: '1', featureType: 'settlement' })
  const country = countryCode(query.country)
  if (country) params.set('countrycodes', country)
  if (email) params.set('email', email)
  return `${NOMINATIM_URL}?${params}`
}

function parse(body: unknown): GeocodeAnswer {
  if (!Array.isArray(body)) throw new GeocodeError('Nominatim je vratio odgovor koji nije spisak mesta.')
  const first = body[0] as { lat?: unknown; lon?: unknown; display_name?: unknown } | undefined
  if (!first) return { found: false }
  const lat = Number(first.lat)
  const lon = Number(first.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof first.lat !== 'string' || typeof first.lon !== 'string') {
    throw new GeocodeError('Nominatim je vratio mesto bez ispravnih koordinata.')
  }
  return { found: true, lat, lon, label: typeof first.display_name === 'string' ? first.display_name : '' }
}
