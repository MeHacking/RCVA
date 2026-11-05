import { describe, expect, it, vi } from 'vitest'
import {
  chunks,
  createOrsDistances,
  createOrsLines,
  createOrsSnap,
  LINE_TOLERANCE_M,
  MAX_LOCATIONS_PER_REQUEST,
  MAX_ROUTES_PER_REQUEST,
  MAX_WAYPOINTS,
  pairKey,
  RoadDistanceError,
  simplify,
} from '../../src/api/local/openRouteService'

// No request leaves the test: fetch is a fake, and so are the clock and the pause.

const KEY = { apiKey: 'test-kljuc', profile: 'driving-hgv' as const }
const POINTS = [
  { lat: 45.0, lon: 20.0 },
  { lat: 46.0, lon: 21.0 },
  { lat: 57.0, lon: 12.0 },
]

interface Sent {
  url: string
  headers: Record<string, string>
  body: { locations: number[][]; sources: number[]; destinations: number[]; metrics: string[]; units: string }
}

/** A fake ORS: the distance is 1000 × (from + 1) + (to + 1), by the index of the point sent. */
function fakeOrs(answer?: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: Sent = {
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Sent['body'],
    }
    sent.push(request)
    if (answer) return answer(request)
    const point = (i: number) => POINTS.findIndex((p) => p.lon === request.body.locations[i][0])
    const distances = request.body.sources.map((s) =>
      request.body.destinations.map((d) => 1000 * (point(s) + 1) + (point(d) + 1) + 0.4),
    )
    return new Response(JSON.stringify({ distances }))
  }) as typeof globalThis.fetch
  return { fetch, sent }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('OpenRouteService distances', () => {
  it('asks the matrix for the wanted pairs, with the key and the profile', async () => {
    const { fetch, sent } = fakeOrs()
    const distances = createOrsDistances({ fetch, minIntervalMs: 0 })
    const result = await distances(
      POINTS,
      [
        [0, 2],
        [2, 0],
        [0, 1],
      ],
      KEY,
    )

    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://api.heigit.org/openrouteservice/v2/matrix/driving-hgv')
    expect(sent[0].headers).toMatchObject({ Authorization: 'test-kljuc', 'Content-Type': 'application/json' })
    // Each point once, as [lon, lat]; sources and destinations point into that list.
    expect(sent[0].body).toEqual({
      locations: [
        [20, 45],
        [12, 57],
        [21, 46],
      ],
      sources: [0, 1],
      destinations: [1, 0, 2],
      metrics: ['distance'],
      units: 'm',
    })
    // Whole metres, and only the pairs asked for (not 2 -> 1, which came with the matrix).
    expect([...result]).toEqual([
      [pairKey(0, 2), 1003],
      [pairKey(2, 0), 3001],
      [pairKey(0, 1), 1002],
    ])
  })

  it('passes on "no road" as null', async () => {
    const { fetch } = fakeOrs(() => json({ distances: [[null]] }))
    const result = await createOrsDistances({ fetch, minIntervalMs: 0 })(POINTS, [[0, 2]], KEY)
    expect(result.get(pairKey(0, 2))).toBeNull()
  })

  it('splits a large matrix into requests within both limits, and covers every pair once', () => {
    const all = Array.from({ length: 60 }, (_, i) => i)
    const parts = chunks(all, all)
    expect(parts.length).toBeGreaterThan(1)
    const covered = new Map<string, number>()
    for (const [sources, destinations] of parts) {
      expect(sources.length * destinations.length).toBeLessThanOrEqual(MAX_ROUTES_PER_REQUEST)
      expect(new Set([...sources, ...destinations]).size).toBeLessThanOrEqual(MAX_LOCATIONS_PER_REQUEST)
      for (const s of sources) for (const d of destinations) covered.set(pairKey(s, d), (covered.get(pairKey(s, d)) ?? 0) + 1)
    }
    expect(covered.size).toBe(60 * 60)
    expect([...covered.values()].every((n) => n === 1)).toBe(true)
    // 50 places fit one request (2500 routes).
    const fifty = all.slice(0, 50)
    expect(chunks(fifty, fifty)).toEqual([[fifty, fifty]])
  })

  it('starts requests at least 1,5 s apart, one at a time, also after a failure', async () => {
    let time = 1_000_000
    const waits: number[] = []
    const started: number[] = []
    let calls = 0
    const { fetch } = fakeOrs(() => {
      started.push(time)
      return ++calls === 1 ? json({}, 500) : json({ distances: [[1]] })
    })
    const distances = createOrsDistances({
      fetch,
      now: () => time,
      wait: async (ms) => {
        waits.push(ms)
        time += ms
      },
    })
    const first = distances(POINTS, [[0, 1]], KEY)
    const second = distances(POINTS, [[1, 2]], KEY)
    await expect(first).rejects.toBeInstanceOf(RoadDistanceError)
    expect((await second).get(pairKey(1, 2))).toBe(1)
    expect(started.map((t) => t - started[0])).toEqual([0, 1500])
    expect(waits).toEqual([1500])
  })

  it('starts the next request only when the one before has answered', async () => {
    let answer: (response: Response) => void = () => {}
    const { fetch, sent } = fakeOrs(() => new Promise<Response>((resolve) => (answer = resolve)))
    const distances = createOrsDistances({ fetch, minIntervalMs: 0 })
    const first = distances(POINTS, [[0, 1]], KEY)
    const second = distances(POINTS, [[1, 2]], KEY)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(sent).toHaveLength(1)
    answer(json({ distances: [[1]] }))
    await first
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    answer(json({ distances: [[2]] }))
    expect((await second).get(pairKey(1, 2))).toBe(2)
  })

  it('turns every kind of failure into a RoadDistanceError with a message for the user', async () => {
    const answers: Array<() => Response | Promise<Response>> = [
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => json({ error: 'Access to this API has been disallowed' }, 403),
      () => json({}, 401),
      () => json({ error: 'Rate limit exceeded' }, 429),
      () => json({ error: { code: 6099, message: 'Unknown internal error' } }, 500),
      () => new Response('<html>', { status: 502 }),
      () => json({ distances: [[1, 2]] }),
      () => json({ distances: [[1], [2]] }),
      () => json({ distances: [[-5]] }),
      () => new Response('nije json'),
    ]
    const messages: string[] = []
    for (const answer of answers) {
      const distances = createOrsDistances({ fetch: fakeOrs(answer).fetch, minIntervalMs: 0 })
      const error = await distances(POINTS, [[0, 1]], KEY).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(RoadDistanceError)
      messages.push((error as Error).message)
    }
    expect(messages).toEqual([
      'OpenRouteService nije dostupan (nema veze sa internetom ili je zahtev odbijen).',
      'OpenRouteService je odbio ključ (HTTP 403); proverite ključ u Podešavanjima.',
      'OpenRouteService je odbio ključ (HTTP 401); proverite ključ u Podešavanjima.',
      'OpenRouteService: potrošena je kvota upita (HTTP 429); pokušajte kasnije.',
      'OpenRouteService nije izračunao kilometraže (HTTP 500): Unknown internal error.',
      'OpenRouteService nije izračunao kilometraže (HTTP 502).',
      'OpenRouteService je vratio matricu koja ne odgovara zahtevu.',
      'OpenRouteService je vratio matricu koja ne odgovara zahtevu.',
      'OpenRouteService je vratio matricu koja ne odgovara zahtevu.',
      'OpenRouteService je vratio matricu koja ne odgovara zahtevu.',
    ])
  })
})

describe('OpenRouteService road lines', () => {
  type LineBody = { coordinates: number[][]; instructions: boolean }
  /** A fake Directions API: the road goes through every waypoint and, before each, through `detour`. */
  type Detour = (from: number[], to: number[]) => number[][]
  function fakeDirections(answer?: () => Response, detour: Detour = () => []) {
    const sent: { url: string; headers: Record<string, string>; body: LineBody }[] = []
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as LineBody
      const headers = init?.headers as Record<string, string>
      sent.push({ url: String(input), headers, body })
      // As the real ORS: GeoJSON only for a request that accepts it.
      if (!headers.Accept.includes('application/geo+json')) return json({ error: { code: 2007, message: 'This response format is not supported' } }, 406)
      if (answer) return answer()
      const coordinates = body.coordinates.flatMap((point, i) => (i === 0 ? [point] : [...detour(body.coordinates[i - 1], point), point]))
      return json({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates } }] })
    }) as typeof globalThis.fetch
    return { fetch, sent }
  }

  it('asks the directions for the stops in order, once per repeated stop, and gives [lat, lon] along the road', async () => {
    // Halfway between the stops the road bends 0,1 degree north (about 11 km), then goes
    // through a point under 2 m off the straight line, which the simplified line leaves out.
    const { fetch, sent } = fakeDirections(undefined, (from, to) => {
      const bend = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.1]
      return [bend, [(bend[0] + to[0]) / 2 + 0.00002, (bend[1] + to[1]) / 2]]
    })
    const line = createOrsLines({ fetch, minIntervalMs: 0 })
    const path = await line([POINTS[0], POINTS[0], POINTS[1], POINTS[2]], { apiKey: 'test-kljuc', profile: 'driving-car' })

    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson')
    expect(sent[0].headers).toEqual({
      Authorization: 'test-kljuc',
      'Content-Type': 'application/json',
      Accept: 'application/geo+json, application/json',
    })
    expect(sent[0].body).toEqual({
      coordinates: [
        [20, 45],
        [21, 46],
        [12, 57],
      ],
      instructions: false,
    })
    expect(path).toEqual([
      [45, 20],
      [45.6, 20.5],
      [46, 21],
      [51.6, 16.5],
      [57, 12],
    ])
  })

  it('splits a route with more waypoints than one request takes, and joins the parts at their shared stop', async () => {
    // A zigzag about 1 km wide, so the simplified line keeps every stop.
    const stops = Array.from({ length: 120 }, (_, i) => ({ lat: 45 + i * 0.01, lon: 20 + (i % 2) * 0.01 }))
    const { fetch, sent } = fakeDirections()
    const path = await createOrsLines({ fetch, minIntervalMs: 0 })(stops, KEY)
    expect(sent.map((s) => s.body.coordinates.length)).toEqual([MAX_WAYPOINTS, MAX_WAYPOINTS, 22])
    expect(sent[1].body.coordinates[0]).toEqual(sent[0].body.coordinates[MAX_WAYPOINTS - 1])
    expect(path).toEqual(stops.map((s) => [Number(s.lat.toFixed(5)), Number(s.lon.toFixed(5))]))
  })

  it('asks nothing for a route that stays at one point', async () => {
    const { fetch, sent } = fakeDirections()
    expect(await createOrsLines({ fetch, minIntervalMs: 0 })([POINTS[1], POINTS[1]], KEY)).toEqual([[46, 21]])
    expect(sent).toEqual([])
  })

  it('starts line requests at least 1,5 s apart', async () => {
    let time = 0
    const started: number[] = []
    const { fetch } = fakeDirections()
    const line = createOrsLines({
      fetch: (async (...args: Parameters<typeof globalThis.fetch>) => {
        started.push(time)
        return fetch(...args)
      }) as typeof globalThis.fetch,
      now: () => time,
      wait: async (ms) => {
        time += ms
      },
    })
    await Promise.all([line(POINTS.slice(0, 2), KEY), line(POINTS.slice(1), KEY)])
    expect(started).toEqual([0, 1500])
  })

  it('turns every kind of failure into a RoadDistanceError with a message for the user', async () => {
    const geometry = (g: unknown) => () => json({ features: [{ geometry: g }] })
    const answers: Array<() => Response> = [
      () => json({ error: { code: 2009, message: 'Route could not be found between the given points' } }, 404),
      () => json({ error: 'Rate limit exceeded' }, 429),
      () => json({}, 403),
      () => json({ features: [] }),
      geometry({ type: 'MultiPoint', coordinates: [[20, 45], [21, 46]] }),
      geometry({ type: 'LineString', coordinates: [[20, 45]] }),
      geometry({ type: 'LineString', coordinates: [[20, 45], [21, 'x']] }),
      geometry({ type: 'LineString', coordinates: [[20, 45], [210, 46]] }),
    ]
    const messages: string[] = []
    for (const answer of answers) {
      const error = await createOrsLines({ fetch: fakeDirections(answer).fetch, minIntervalMs: 0 })(POINTS, KEY).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(RoadDistanceError)
      messages.push((error as Error).message)
    }
    expect(messages).toEqual([
      'OpenRouteService nije izračunao liniju puta (HTTP 404): Route could not be found between the given points.',
      'OpenRouteService: potrošena je kvota upita (HTTP 429); pokušajte kasnije.',
      'OpenRouteService je odbio ključ (HTTP 403); proverite ključ u Podešavanjima.',
      ...Array<string>(5).fill('OpenRouteService je vratio liniju puta koja ne odgovara zahtevu.'),
    ])
  })
})

describe('simplified road lines', () => {
  it('keeps the ends and the points farther from the line than the tolerance', () => {
    // 0,0001 degree of latitude is about 11 m; 0,001 about 110 m.
    // The middle point is 110 m off the ends' line; the others 11 m off the lines to it.
    const line: Array<[number, number]> = [
      [45, 20],
      [45.0006, 20.05],
      [45.001, 20.1],
      [45.0004, 20.15],
      [45, 20.2],
    ]
    expect(simplify(line, LINE_TOLERANCE_M)).toEqual([line[0], line[2], line[4]])
    expect(simplify(line, 5)).toEqual(line)
    expect(simplify(line.slice(0, 2), LINE_TOLERANCE_M)).toEqual(line.slice(0, 2))
  })
})

describe('nearest road for lorries (ORS Snap)', () => {
  it('sends the points as [lon, lat] with the radius, and reads a road, its name, or none', async () => {
    const sent: { url: string; headers: Record<string, string>; body: unknown }[] = []
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) })
      return new Response(
        JSON.stringify({
          locations: [{ location: [10.76, 59.92], name: ' Teretna ulica ', snapped_distance: 1840.6 }, null, { location: [20, 45], snapped_distance: 3 }],
        }),
      )
    }) as typeof globalThis.fetch
    const snap = createOrsSnap({ fetch, minIntervalMs: 0 })
    const answers = await snap(POINTS, { ...KEY, radiusMeters: 5000 })
    expect(sent).toEqual([
      {
        url: 'https://api.heigit.org/openrouteservice/v2/snap/driving-hgv/json',
        headers: { Authorization: 'test-kljuc', 'Content-Type': 'application/json', Accept: 'application/json' },
        body: { locations: POINTS.map((p) => [p.lon, p.lat]), radius: 5000 },
      },
    ])
    expect(answers).toEqual([
      { at: { lat: 59.92, lon: 10.76 }, distanceMeters: 1841, street: 'Teretna ulica' },
      null,
      { at: { lat: 45, lon: 20 }, distanceMeters: 3, street: null },
    ])
  })

  it('refuses an answer it does not understand, and passes the ORS failure on', async () => {
    const answering = (response: Response) => createOrsSnap({ fetch: (async () => response) as typeof globalThis.fetch, minIntervalMs: 0 })
    await expect(answering(new Response(JSON.stringify({ locations: [null] })))(POINTS, { ...KEY, radiusMeters: 5000 })).rejects.toThrow(
      new RoadDistanceError('OpenRouteService je vratio neočekivan odgovor za najbliži put.'),
    )
    await expect(
      answering(new Response(JSON.stringify({ locations: [{ location: ['x', 1], snapped_distance: 1 }, null, null] })))(POINTS, { ...KEY, radiusMeters: 5000 }),
    ).rejects.toThrow('neočekivan odgovor')
    await expect(answering(new Response('{}', { status: 429 }))(POINTS, { ...KEY, radiusMeters: 5000 })).rejects.toThrow(
      'potrošena je kvota upita (HTTP 429)',
    )
  })
})
