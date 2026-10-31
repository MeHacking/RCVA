import { describe, expect, it } from 'vitest'
import { createNominatimGeocoder, GeocodeError, placeKey, searchUrl } from '../../src/api/local/nominatim'

// No request leaves the test: fetch is a fake, and so are the clock and the pause.

const BEOGRAD = [{ lat: '44.8178131', lon: '20.4568974', display_name: 'Beograd, Srbija' }]

function fakeFetch(answer: (url: URL) => Response | Promise<Response>) {
  const urls: URL[] = []
  const fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    urls.push(url)
    return answer(url)
  }) as typeof globalThis.fetch
  return { fetch, urls }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** A clock that only moves when the geocoder waits, and remembers when each request started. */
function fakeClock() {
  let time = 1_000_000
  const waits: number[] = []
  return {
    now: () => time,
    wait: async (ms: number) => {
      waits.push(ms)
      time += ms
    },
    advance: (ms: number) => (time += ms),
    waits,
  }
}

describe('Nominatim geocoder', () => {
  it('asks for one settlement in the given country, with the contact e-mail when there is one', () => {
    const url = new URL(searchUrl({ name: 'Novi Sad', country: 'RS' }, 'dispecer@example.com'))
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'Novi Sad',
      format: 'jsonv2',
      limit: '1',
      featureType: 'settlement',
      countrycodes: 'rs',
      email: 'dispecer@example.com',
    })
    // Bosnia is written BIH in the files; an unknown code is not sent.
    expect(new URL(searchUrl({ name: 'Bihać', country: 'BIH' }, null)).searchParams.get('countrycodes')).toBe('ba')
    const plain = new URL(searchUrl({ name: 'Ljungby', country: null }, null)).searchParams
    expect([plain.has('countrycodes'), plain.has('email')]).toEqual([false, false])
  })

  it('reads the first place, and an empty list as not found', async () => {
    const { fetch } = fakeFetch((url) => json(url.searchParams.get('q') === 'Beograd' ? BEOGRAD : []))
    const geocoder = createNominatimGeocoder({ fetch, contactEmail: () => null, minIntervalMs: 0 })
    expect(await geocoder.geocode({ name: 'Beograd', country: 'RS' })).toEqual({
      found: true,
      lat: 44.8178131,
      lon: 20.4568974,
      label: 'Beograd, Srbija',
    })
    expect(await geocoder.geocode({ name: 'Nepoznato Selo', country: 'RS' })).toEqual({ found: false })
  })

  it('starts requests at least one second apart, one at a time, also when called together', async () => {
    const clock = fakeClock()
    const started: number[] = []
    const { fetch } = fakeFetch(() => {
      started.push(clock.now())
      return json(BEOGRAD)
    })
    const geocoder = createNominatimGeocoder({ fetch, contactEmail: () => null, now: clock.now, wait: clock.wait })
    await Promise.all(['A', 'B', 'C'].map((name) => geocoder.geocode({ name, country: null })))
    expect(started.map((t) => t - started[0])).toEqual([0, 1000, 2000])

    // After a longer pause there is nothing to wait for.
    clock.advance(5000)
    await geocoder.geocode({ name: 'D', country: null })
    expect(clock.waits).toEqual([1000, 1000])
  })

  it('keeps the pause after a failed request too', async () => {
    const clock = fakeClock()
    const started: number[] = []
    const { fetch } = fakeFetch(() => {
      started.push(clock.now())
      return json({}, 503)
    })
    const geocoder = createNominatimGeocoder({ fetch, contactEmail: () => null, now: clock.now, wait: clock.wait })
    await expect(geocoder.geocode({ name: 'A', country: null })).rejects.toBeInstanceOf(GeocodeError)
    await expect(geocoder.geocode({ name: 'B', country: null })).rejects.toBeInstanceOf(GeocodeError)
    expect(started[1] - started[0]).toBe(1000)
  })

  it('turns every kind of failure into a GeocodeError with a message for the user', async () => {
    const answers: Array<() => Response | Promise<Response>> = [
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => json({}, 429),
      () => json({}, 500),
      () => new Response('<html>', { status: 200 }),
      () => json([{ lat: 'x', lon: '20' }]),
    ]
    const messages: string[] = []
    for (const answer of answers) {
      const geocoder = createNominatimGeocoder({ fetch: fakeFetch(answer).fetch, contactEmail: () => null, minIntervalMs: 0 })
      const error = await geocoder.geocode({ name: 'Beograd', country: 'RS' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(GeocodeError)
      messages.push((error as Error).message)
    }
    expect(messages).toEqual([
      'Nominatim nije dostupan (nema veze sa internetom ili je zahtev odbijen).',
      'Nominatim je odbio zahtev (HTTP 429); previše upita, pokušajte kasnije.',
      'Nominatim nije odgovorio kako treba (HTTP 500).',
      'Nominatim je vratio odgovor koji nije spisak mesta.',
      'Nominatim je vratio mesto bez ispravnih koordinata.',
    ])
  })

  it('reads the contact e-mail for every request', async () => {
    let email: string | null = null
    const { fetch, urls } = fakeFetch(() => json(BEOGRAD))
    const geocoder = createNominatimGeocoder({ fetch, contactEmail: () => email, minIntervalMs: 0 })
    await geocoder.geocode({ name: 'Beograd', country: 'RS' })
    email = 'dispecer@example.com'
    await geocoder.geocode({ name: 'Beograd', country: 'RS' })
    expect(urls.map((u) => u.searchParams.get('email'))).toEqual([null, 'dispecer@example.com'])
  })

  it('treats the same name in the same country as the same query', () => {
    expect(placeKey({ name: 'Niš', country: 'RS' })).toBe(placeKey({ name: ' NIS ', country: 'rs' }))
    expect(placeKey({ name: 'Göteborg', country: null })).toBe('goteborg|')
    expect(placeKey({ name: 'Niš', country: 'RS' })).not.toBe(placeKey({ name: 'Niš', country: null }))
  })
})
