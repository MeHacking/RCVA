import { ApiError, type ApiClient } from '../client'
import type { ProblemDetails, Truck } from '../types'

/**
 * ApiClient calls over HTTP to /api/v1 (proxied to the backend by Vite in development).
 * Non-2xx answers become ApiError with the server's Problem Details.
 */
export function createHttpClient(baseUrl = '/api/v1', fetchImpl: typeof fetch = (...args) => fetch(...args)): ApiClient {
  /** A FormData body goes as multipart (the browser sets the boundary), anything else as JSON. */
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const json = body !== undefined && !(body instanceof FormData)
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: json ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
        body: json ? JSON.stringify(body) : (body as FormData | undefined),
      })
    } catch {
      throw new ApiError({ title: 'Server nije dostupan', status: 0, detail: 'Server nije dostupan. Proverite da li je backend pokrenut.' })
    }
    if (!response.ok) throw new ApiError(await readProblem(response))
    // 204, or 200 without a body (PUT /imports/{id}/mapping)
    const text = await response.text()
    return (text === '' ? undefined : JSON.parse(text)) as T
  }

  return {
    listTrucks: () => request<ServerTruck[]>('GET', '/trucks').then((trucks) => trucks.map(withPayload)),
    createTruck: (input) => request<ServerTruck>('POST', '/trucks', input).then(withPayload),
    updateTruck: (id, input) => request<ServerTruck>('PUT', `/trucks/${id}`, input).then(withPayload),
    deleteTruck: (id) => request('DELETE', `/trucks/${id}`),
    getBase: () => request('GET', '/base'),
    listShipments: () => request('GET', '/shipments'),
    listLocations: () => request('GET', '/locations'),
    createImport: (file) => {
      const form = new FormData()
      form.append('file', file, file.name)
      return request('POST', '/imports/excel', form)
    },
    setImportMapping: (importId, mapping) => request('PUT', `/imports/${importId}/mapping`, mapping),
    getImportPreview: (importId) => request('GET', `/imports/${importId}/preview`),
    updateImportRow: (importId, rowNumber, patch) => request('PUT', `/imports/${importId}/rows/${rowNumber}`, patch),
    commitImport: (importId) => request('POST', `/imports/${importId}/commit`),
    createOptimizationJob: (jobRequest) => request('POST', '/optimization-jobs', jobRequest),
    getOptimizationJob: (id) => request('GET', `/optimization-jobs/${id}`),
    // The backend has no such endpoint yet (see ApiClient), so a reload forgets the job.
    getLatestOptimizationJob: async () => null,
    getOptimizationResult: (id) => request('GET', `/optimization-jobs/${id}/result`),
    getLoadPlan: (jobId, truckId) => request('GET', `/optimization-jobs/${jobId}/trucks/${truckId}/load-plan`),
  }
}

/** The backend has no payload yet (B2 is only on the device): missing means not limited. */
type ServerTruck = Omit<Truck, 'capacityKg'> & { capacityKg?: number | null }

function withPayload(truck: ServerTruck): Truck {
  return { ...truck, capacityKg: truck.capacityKg ?? null }
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
