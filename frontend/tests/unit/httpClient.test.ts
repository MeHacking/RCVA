import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import { createHttpClient } from '../../src/api/http/httpClient'

interface Call {
  url: string
  method: string
  body: unknown
}

function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    return respond(call)
  }) as typeof fetch
  return { impl, calls }
}

const json = (status: number, body: unknown, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } })

const TRUCK = { name: 'Solo 2', capacityLdmTenths: 70, available: true, innerLengthMm: null, innerWidthMm: null, innerHeightMm: null }

describe('createHttpClient', () => {
  it('calls the REST paths with the right methods and bodies', async () => {
    const { impl, calls } = fakeFetch((call) =>
      call.method === 'DELETE' ? new Response(null, { status: 204 }) : json(call.method === 'POST' ? 201 : 200, { id: 4, ...TRUCK }),
    )
    const api = createHttpClient('/api/v1', impl)

    await api.listTrucks()
    expect(await api.createTruck(TRUCK)).toEqual({ id: 4, ...TRUCK })
    await api.updateTruck(4, TRUCK)
    expect(await api.deleteTruck(4)).toBeUndefined()
    await api.getBase()

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/trucks',
      'POST /api/v1/trucks',
      'PUT /api/v1/trucks/4',
      'DELETE /api/v1/trucks/4',
      'GET /api/v1/base',
    ])
    expect(calls[1].body).toEqual(TRUCK)
  })

  it('turns Problem Details into ApiError with field errors', async () => {
    const problem = {
      title: 'Neispravni podaci o kamionu',
      status: 400,
      errors: { capacityLdmTenths: 'Kapacitet mora biti veći od 0.' },
    }
    const api = createHttpClient('/api/v1', fakeFetch(() => json(400, problem, 'application/problem+json')).impl)
    const error = await api.createTruck(TRUCK).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).problem.errors).toEqual(problem.errors)
  })

  it('keeps the detail of a 409 as the message', async () => {
    const api = createHttpClient(
      '/api/v1',
      fakeFetch(() => json(409, { title: 'Kamion se koristi', status: 409, detail: 'Optimizacija #1 je u toku.' })).impl,
    )
    const error = (await api.deleteTruck(1).catch((e: unknown) => e)) as ApiError
    expect(error.message).toBe('Optimizacija #1 je u toku.')
  })

  it('falls back to the HTTP status text when the body is not JSON', async () => {
    const api = createHttpClient('/api/v1', fakeFetch(() => new Response('oops', { status: 502, statusText: 'Bad Gateway' })).impl)
    const error = (await api.listTrucks().catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(502)
    expect(error.problem.title).toBe('Bad Gateway')
  })

  it('reports an unreachable server', async () => {
    const api = createHttpClient('/api/v1', (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch)
    const error = (await api.listTrucks().catch((e: unknown) => e)) as ApiError
    expect(error.problem.title).toBe('Server nije dostupan')
  })
})
