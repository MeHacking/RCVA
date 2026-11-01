import type { LatLon } from '../../domain/optimization/distance'
import type { OrsProfile } from '../types'

// Road distances from the OpenRouteService Matrix API (v2), and road lines for the map from
// its Directions API. The user makes the key, and it is kept only on the device (settings).
// Limits, as reported on the ORS forum and to be checked on the account: at most 3500
// routes (sources x destinations) and 50 locations per matrix request, 50 waypoints per
// directions request, 40 requests a minute each; so requests go one at a time, 1,5 s apart.
// Road distances are directed: A to B is not always B to A.
//
// The host is api.heigit.org: the old api.openrouteservice.org was deprecated on 28.04.2026
// and is shut down on 02.-06.11.2026 (ORS forum announcement); the same keys work on both.
// CORS on the new host checked 01.11.2026 (OPTIONS, without a key): allows any origin.

export const ORS_MATRIX_URL = 'https://api.heigit.org/openrouteservice/v2/matrix'
export const ORS_DIRECTIONS_URL = 'https://api.heigit.org/openrouteservice/v2/directions'
export const ORS_ATTRIBUTION = '© openrouteservice.org by HeiGIT'
export const MAX_ROUTES_PER_REQUEST = 3500
export const MAX_LOCATIONS_PER_REQUEST = 50
export const MAX_WAYPOINTS = 50
/** The directions answer in GeoJSON (application/geo+json); with only application/json ORS answers 406. */
export const GEOJSON_ACCEPT = 'application/geo+json, application/json'
/** A road line keeps only the points farther than this from the line without them. */
export const LINE_TOLERANCE_M = 25

/** Any failed ORS request, with a message for the user. */
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

/** [lat, lon] points along the roads, from the first stop to the last, in visiting order */
export type RoadLine = (stops: LatLon[], request: { apiKey: string; profile: OrsProfile }) => Promise<Array<[number, number]>>

export const pairKey = (from: number, to: number) => `${from}>${to}`

export function createOrsDistances(options: OrsOptions): RoadDistances {
  const inTurn = createTurns(options)

  async function ask(
    points: LatLon[],
    sources: number[],
    destinations: number[],
    request: { apiKey: string; profile: OrsProfile },
  ): Promise<(number | null)[][]> {
    // Each location is sent once; sources and destinations point into that list.
    const sent = [...new Set([...sources, ...destinations])]
    const at = new Map(sent.map((point, index) => [point, index]))
    const body = (await post(options.fetch, `${ORS_MATRIX_URL}/${request.profile}`, request.apiKey, 'kilometraže', {
      locations: sent.map((point) => [points[point].lon, points[point].lat]),
      sources: sources.map((point) => at.get(point)),
      destinations: destinations.map((point) => at.get(point)),
      metrics: ['distance'],
      units: 'm',
    })) as { distances?: unknown } | null
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
      const rows = await inTurn(() => ask(points, sourceChunk, destinationChunk, request))
      sourceChunk.forEach((from, i) => destinationChunk.forEach((to, j) => result.set(pairKey(from, to), rows[i][j])))
    }
    // Only what was asked for: a chunk may also bring pairs nobody wanted.
    return new Map(pairs.map(([from, to]) => [pairKey(from, to), result.get(pairKey(from, to)) as number | null]))
  }
}

/**
 * The road line through the stops (Directions API, GeoJSON). Repeated stops at the same
 * point are sent once; a route with more waypoints than one request takes goes in parts
 * that share their joining stop. The line is simplified (LINE_TOLERANCE_M), since a long
 * route by road has thousands of points and every line is kept on the device.
 */
export function createOrsLines(options: OrsOptions): RoadLine {
  const inTurn = createTurns(options)
  return async (points, request) => {
    const stops = points.filter((p, i) => i === 0 || p.lat !== points[i - 1].lat || p.lon !== points[i - 1].lon)
    if (stops.length < 2) return stops.map((p) => [p.lat, p.lon])
    const line: number[][] = []
    for (let start = 0; start < stops.length - 1; start += MAX_WAYPOINTS - 1) {
      const part = stops.slice(start, start + MAX_WAYPOINTS)
      const body = await inTurn(() =>
        post(
          options.fetch,
          `${ORS_DIRECTIONS_URL}/${request.profile}/geojson`,
          request.apiKey,
          'liniju puta',
          { coordinates: part.map((p) => [p.lon, p.lat]), instructions: false },
          GEOJSON_ACCEPT,
        ),
      )
      const coordinates = lineOf(body)
      if (!coordinates) throw new RoadDistanceError('OpenRouteService je vratio liniju puta koja ne odgovara zahtevu.')
      line.push(...(line.length > 0 ? coordinates.slice(1) : coordinates))
    }
    const round = (degrees: number) => Math.round(degrees * 1e5) / 1e5
    return simplify(
      line.map(([lon, lat]) => [round(lat), round(lon)]),
      LINE_TOLERANCE_M,
    )
  }
}

/** The [lon, lat] points of the first route in a Directions GeoJSON answer; null when it is not one. */
function lineOf(body: unknown): number[][] | null {
  const geometry = (body as { features?: Array<{ geometry?: { type?: unknown; coordinates?: unknown } }> } | null)
    ?.features?.[0]?.geometry
  const coordinates = geometry?.coordinates
  const valid =
    geometry?.type === 'LineString' &&
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    coordinates.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        point.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
        Math.abs(point[0]) <= 180 &&
        Math.abs(point[1]) <= 90,
    )
  return valid ? (coordinates as number[][]) : null
}

/**
 * Douglas-Peucker on [lat, lon] points: keeps the ends and every point farther than
 * `toleranceM` metres from the simplified line (distances on a local flat projection).
 */
export function simplify(points: Array<[number, number]>, toleranceM: number): Array<[number, number]> {
  if (points.length <= 2) return points
  const cos = Math.cos((points[0][0] * Math.PI) / 180)
  const xy = points.map(([lat, lon]) => [lon * cos * 111_320, lat * 110_540])
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const pending: Array<[number, number]> = [[0, points.length - 1]]
  while (pending.length > 0) {
    const [first, last] = pending.pop() as [number, number]
    let farthest = -1
    let distance = toleranceM
    for (let i = first + 1; i < last; i++) {
      const d = toSegment(xy[i], xy[first], xy[last])
      if (d > distance) {
        farthest = i
        distance = d
      }
    }
    if (farthest < 0) continue
    keep[farthest] = true
    pending.push([first, farthest], [farthest, last])
  }
  return points.filter((_, i) => keep[i])
}

function toSegment([px, py]: number[], [ax, ay]: number[], [bx, by]: number[]): number {
  const [dx, dy] = [bx - ax, by - ay]
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
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

/** One request at a time, each started at least `minIntervalMs` after the one before, also after a failure. */
function createTurns(options: OrsOptions) {
  const {
    minIntervalMs = 1500,
    now = () => Date.now(),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options
  let turn: Promise<unknown> = Promise.resolve()
  let lastStart = -Infinity
  return <T>(task: () => Promise<T>): Promise<T> => {
    const answer = turn.then(async () => {
      const delay = lastStart + minIntervalMs - now()
      if (delay > 0) await wait(delay)
      lastStart = now()
      return task()
    })
    turn = answer.catch(() => undefined)
    return answer
  }
}

/**
 * The parsed JSON answer (null when it is not JSON); `what` names the answer in the failure
 * message. ORS answers 406 when `accept` does not allow its format (GeoJSON for lines).
 */
async function post(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  what: string,
  body: unknown,
  accept = 'application/json',
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: accept },
    body: JSON.stringify(body),
  }).catch((error: unknown) => {
    throw new RoadDistanceError('OpenRouteService nije dostupan (nema veze sa internetom ili je zahtev odbijen).', {
      cause: error,
    })
  })
  if (!response.ok) throw new RoadDistanceError(await failure(response, what))
  return response.json().catch(() => null)
}

async function failure(response: Response, what: string): Promise<string> {
  const { status } = response
  if (status === 401 || status === 403) {
    return `OpenRouteService je odbio ključ (HTTP ${status}); proverite ključ u Podešavanjima.`
  }
  if (status === 429) return 'OpenRouteService: potrošena je kvota upita (HTTP 429); pokušajte kasnije.'
  const body = (await response.json().catch(() => null)) as { error?: { message?: unknown } | unknown } | null
  const message = typeof body?.error === 'object' && body.error ? (body.error as { message?: unknown }).message : body?.error
  const detail = typeof message === 'string' ? `: ${message.slice(0, 200)}` : ''
  return `OpenRouteService nije izračunao ${what} (HTTP ${status})${detail}.`
}
