import { ApiError, type ApiClient } from '../client'
import type { ProblemDetails } from '../types'

/** The part of ApiClient the backend serves so far (backend/, Spring Boot). */
export type ServerApi = Pick<ApiClient, 'listTrucks' | 'createTruck' | 'updateTruck' | 'deleteTruck' | 'getBase'>

/**
 * ApiClient calls over HTTP to /api/v1 (proxied to the backend by Vite in development).
 * Non-2xx answers become ApiError with the server's Problem Details.
 */
export function createHttpClient(baseUrl = '/api/v1', fetchImpl: typeof fetch = (...args) => fetch(...args)): ServerApi {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError({ title: 'Server nije dostupan', status: 0, detail: 'Server nije dostupan. Proverite da li je backend pokrenut.' })
    }
    if (!response.ok) throw new ApiError(await readProblem(response))
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    listTrucks: () => request('GET', '/trucks'),
    createTruck: (input) => request('POST', '/trucks', input),
    updateTruck: (id, input) => request('PUT', `/trucks/${id}`, input),
    deleteTruck: (id) => request('DELETE', `/trucks/${id}`),
    getBase: () => request('GET', '/base'),
  }
}

async function readProblem(response: Response): Promise<ProblemDetails> {
  const fallback: ProblemDetails = { title: response.statusText || 'Greška servera', status: response.status }
  try {
    const body = (await response.json()) as Partial<ProblemDetails>
    return { ...fallback, ...body, status: response.status, title: body.title ?? fallback.title }
  } catch {
    return fallback
  }
}
