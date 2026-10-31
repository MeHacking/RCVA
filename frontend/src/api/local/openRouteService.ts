import type { LatLon } from '../../domain/optimization/distance'
import type { OrsProfile } from '../types'

// Road distances from the OpenRouteService Matrix API (v2). The user makes the key, and it
// is kept only on the device (settings). Limits, as reported on the ORS forum and to be
// checked on the account: at most 3500 routes (sources x destinations) and 50 locations
// per request, 40 matrix requests a minute; so requests go one at a time, 1,5 s apart.
// Road distances are directed: A to B is not always B to A.

export const ORS_MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix'
export const ORS_ATTRIBUTION = '© openrouteservice.org by HeiGIT'
export const MAX_ROUTES_PER_REQUEST = 3500
export const MAX_LOCATIONS_PER_REQUEST = 50

export class RoadDistanceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'RoadDistanceError'
  }
}

export interface OrsOptions {
  fetch: typeof fetch
  minIntervalMs?: number
  now?: () => number
  wait?: (ms: number) => Promise<void>
}

/** metres for each wanted pair [from, to] (indices into `points`); null where ORS finds no road */
export type RoadDistances = (
  points: LatLon[],
  pairs: ReadonlyArray<readonly [number, number]>,
  request: { apiKey: string; profile: OrsProfile },
) => Promise<Map<string, number | null>>

export const pairKey = (from: number, to: number) => `${from}>${to}`

export function createOrsDistances(options: OrsOptions): RoadDistances {
  const {
    fetch: fetchImpl,
    minIntervalMs = 1500,
    now = () => Date.now(),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options
  let turn: Promise<unknown> = Promise.resolve()
  let lastStart = -Infinity

  async function ask(
    points: LatLon[],
    sources: number[],
    destinations: number[],
    request: { apiKey: string; profile: OrsProfile },
  ): Promise<(number | null)[][]> {
    const delay = lastStart + minIntervalMs - now()
    if (delay > 0) await wait(delay)
    lastStart = now()
    // Each location is sent once; sources and destinations point into that list.
    const sent = [...new Set([...sources, ...destinations])]
    const at = new Map(sent.map((point, index) => [point, index]))
    const response = await fetchImpl(`${ORS_MATRIX_URL}/${request.profile}`, {
      method: 'POST',
      headers: { Authorization: request.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        locations: sent.map((point) => [points[point].lon, points[point].lat]),
        sources: sources.map((point) => at.get(point)),
        destinations: destinations.map((point) => at.get(point)),
        metrics: ['distance'],
        units: 'm',
      }),
    }).catch((error: unknown) => {
      throw new RoadDistanceError('OpenRouteService nije dostupan (nema veze sa internetom ili je zahtev odbijen).', {
        cause: error,
      })
    })
    if (!response.ok) throw new RoadDistanceError(await failure(response))
    const body = (await response.json().catch(() => null)) as { distances?: unknown } | null
    const rows = body?.distances
    const valid =
      Array.isArray(rows) &&
      rows.length === sources.length &&
      rows.every(
        (row) =>
          Array.isArray(row) &&
          row.length === destinations.length &&
          row.every((m) => m === null || (typeof m === 'number' && Number.isFinite(m) && m >= 0)),
      )
    if (!valid) throw new RoadDistanceError('OpenRouteService je vratio matricu koja ne odgovara zahtevu.')
    return (rows as (number | null)[][]).map((row) => row.map((m) => (m === null ? null : Math.round(m))))
  }

  return async (points, pairs, request) => {
    const result = new Map<string, number | null>()
    const sources = [...new Set(pairs.map(([from]) => from))]
    const destinations = [...new Set(pairs.map(([, to]) => to))]
    for (const [sourceChunk, destinationChunk] of chunks(sources, destinations)) {
      const answer = turn.then(() => ask(points, sourceChunk, destinationChunk, request))
      turn = answer.catch(() => undefined)
      const rows = await answer
      sourceChunk.forEach((from, i) => destinationChunk.forEach((to, j) => result.set(pairKey(from, to), rows[i][j])))
    }
    // Only what was asked for: a chunk may also bring pairs nobody wanted.
    return new Map(pairs.map(([from, to]) => [pairKey(from, to), result.get(pairKey(from, to)) as number | null]))
  }
}

/** Splits sources x destinations into requests within both limits. */
export function chunks(sources: number[], destinations: number[]): Array<[number[], number[]]> {
  const fits = (s: number[], d: number[]) =>
    s.length * d.length <= MAX_ROUTES_PER_REQUEST && new Set([...s, ...d]).size <= MAX_LOCATIONS_PER_REQUEST
  if (fits(sources, destinations)) return [[sources, destinations]]
  // Half of the locations each way always fits both limits (25 + 25, 625 routes).
  const size = MAX_LOCATIONS_PER_REQUEST / 2
  const result: Array<[number[], number[]]> = []
  for (let i = 0; i < sources.length; i += size) {
    for (let j = 0; j < destinations.length; j += size) {
      result.push([sources.slice(i, i + size), destinations.slice(j, j + size)])
    }
  }
  return result
}

async function failure(response: Response): Promise<string> {
  const { status } = response
  if (status === 401 || status === 403) {
    return `OpenRouteService je odbio ključ (HTTP ${status}); proverite ključ u Podešavanjima.`
  }
  if (status === 429) return 'OpenRouteService: potrošena je kvota upita (HTTP 429); pokušajte kasnije.'
  const body = (await response.json().catch(() => null)) as { error?: { message?: unknown } | unknown } | null
  const message = typeof body?.error === 'object' && body.error ? (body.error as { message?: unknown }).message : body?.error
  const detail = typeof message === 'string' ? `: ${message.slice(0, 200)}` : ''
  return `OpenRouteService nije izračunao kilometraže (HTTP ${status})${detail}.`
}
