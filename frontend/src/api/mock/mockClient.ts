import type { Scenario } from '../../fixtures'
import { ApiError, type ApiClient } from '../client'
import type { JobStatus, OptimizationJob, OptimizationJobRequest, Truck, TruckInput } from '../types'

export interface MockApiOptions {
  scenario: Scenario
  /** simulated network latency per call */
  latencyMs?: number
  /** time a job spends in QUEUED */
  queuedMs?: number
  /** time a job spends in RUNNING before reaching its outcome */
  runningMs?: number
  /** injectable clock (ms) so tests can drive status transitions */
  now?: () => number
}

interface JobRecord {
  id: number
  createdAtMs: number
  timeLimitSeconds: number
}

/**
 * In-memory ApiClient over a fixture scenario. Every job on a scenario ends with the
 * scenario's fixed outcome; edits to trucks do not change it (there is no solver here).
 * Returned objects are copies, so callers cannot mutate the mock's state.
 */
export function createMockApiClient(options: MockApiOptions): ApiClient {
  const { scenario, latencyMs = 300, queuedMs = 800, runningMs = 3000, now = Date.now } = options
  const trucks: Truck[] = structuredClone(scenario.trucks)
  const jobs = new Map<number, JobRecord>()
  let nextTruckId = Math.max(0, ...trucks.map((t) => t.id)) + 1
  let nextJobId = 1

  async function respond<T>(produce: () => T): Promise<T> {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
    return structuredClone(produce())
  }

  function findJob(id: number): JobRecord {
    const job = jobs.get(id)
    if (!job) throw notFound(`Posao optimizacije ${id} ne postoji.`)
    return job
  }

  function jobView(job: JobRecord): OptimizationJob {
    const elapsed = now() - job.createdAtMs
    const startedAtMs = job.createdAtMs + queuedMs
    const finishedAtMs = startedAtMs + runningMs
    const outcome = scenario.outcome
    const view: OptimizationJob = {
      id: job.id,
      status: 'QUEUED',
      infeasibilityKind: null,
      createdAt: iso(job.createdAtMs),
      startedAt: null,
      finishedAt: null,
      timeLimitSeconds: job.timeLimitSeconds,
      scoreHard: null,
      scoreMedium: null,
      scoreSoft: null,
      feasible: null,
      trucksLowerBound: null,
    }
    if (elapsed < queuedMs) return view
    view.status = 'RUNNING'
    view.startedAt = iso(startedAtMs)
    if (elapsed < queuedMs + runningMs) return view

    view.finishedAt = iso(finishedAtMs)
    if (outcome.kind === 'COMPLETED') {
      const { result } = outcome
      return {
        ...view,
        status: 'COMPLETED',
        scoreHard: 0,
        scoreMedium: -result.trucksUsed,
        scoreSoft: -result.totalMeters,
        feasible: true,
        trucksLowerBound: result.trucksLowerBound,
      }
    }
    if (outcome.kind === 'NOT_FOUND') {
      return {
        ...view,
        status: 'INFEASIBLE',
        infeasibilityKind: 'NOT_FOUND',
        feasible: false,
        trucksLowerBound: outcome.trucksLowerBound,
      }
    }
    // PROVEN never creates a job (see createOptimizationJob).
    throw new Error('Unreachable: PROVEN scenario has no jobs')
  }

  return {
    listLocations: () => respond(() => scenario.locations),
    listShipments: () => respond(() => scenario.shipments),
    listTrucks: () => respond(() => trucks),
    getBase: () => respond(() => scenario.base),

    createTruck: (input) =>
      respond(() => {
        assertValidTruck(input)
        const created: Truck = { ...input, id: nextTruckId++ }
        trucks.push(created)
        return created
      }),

    updateTruck: (id, input) =>
      respond(() => {
        const index = trucks.findIndex((t) => t.id === id)
        if (index < 0) throw notFound(`Kamion ${id} ne postoji.`)
        assertValidTruck(input)
        trucks[index] = { ...input, id }
        return trucks[index]
      }),

    createOptimizationJob: (request: OptimizationJobRequest) =>
      respond(() => {
        if (!(request.timeLimitSeconds > 0)) {
          throw new ApiError({
            title: 'Neispravan zahtev',
            status: 400,
            errors: { timeLimitSeconds: 'Vremensko ograničenje mora biti veće od 0.' },
          })
        }
        if (scenario.outcome.kind === 'PROVEN') {
          throw new ApiError({
            title: 'Dokazano neizvodljivo',
            status: 422,
            detail: 'Provera pre pokretanja je dokazala da rešenje ne postoji. Solver nije pokrenut.',
            infeasibilityKind: 'PROVEN',
            causes: scenario.outcome.causes,
          })
        }
        const job: JobRecord = { id: nextJobId++, createdAtMs: now(), timeLimitSeconds: request.timeLimitSeconds }
        jobs.set(job.id, job)
        return { id: job.id, status: 'QUEUED' as JobStatus }
      }),

    getOptimizationJob: (id) => respond(() => jobView(findJob(id))),

    getOptimizationResult: (id) =>
      respond(() => {
        const view = jobView(findJob(id))
        if (view.status !== 'COMPLETED' || scenario.outcome.kind !== 'COMPLETED') {
          throw new ApiError({
            title: 'Rezultat nije dostupan',
            status: 409,
            detail: `Posao ${id} je u statusu ${view.status}; rezultat postoji samo za COMPLETED.`,
          })
        }
        return scenario.outcome.result
      }),
  }
}

function assertValidTruck(input: TruckInput): void {
  const errors: Record<string, string> = {}
  if (input.name.trim() === '') errors.name = 'Naziv je obavezan.'
  if (!Number.isInteger(input.capacityLdmTenths) || input.capacityLdmTenths <= 0) {
    errors.capacityLdmTenths = 'Kapacitet mora biti veći od 0.'
  }
  for (const field of ['innerLengthMm', 'innerWidthMm', 'innerHeightMm'] as const) {
    const value = input[field]
    if (value !== null && (!Number.isInteger(value) || value <= 0)) errors[field] = 'Mora biti pozitivan ceo broj.'
  }
  if (Object.keys(errors).length > 0) {
    throw new ApiError({ title: 'Neispravni podaci o kamionu', status: 400, errors })
  }
}

function notFound(detail: string): ApiError {
  return new ApiError({ title: 'Ne postoji', status: 404, detail })
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}
