import { describe, expect, it, vi } from 'vitest'
import {
  chunks,
  createOrsDistances,
  MAX_LOCATIONS_PER_REQUEST,
  MAX_ROUTES_PER_REQUEST,
  pairKey,
  RoadDistanceError,
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
    expect(sent[0].url).toBe('https://api.openrouteservice.org/v2/matrix/driving-hgv')
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
