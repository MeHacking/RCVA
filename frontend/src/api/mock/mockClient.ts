import { defaultJobName } from '../../format/jobName'
import type { Scenario } from '../../fixtures'
import { ApiError, type ApiClient } from '../client'
import {
  TERMINAL_JOB_STATUSES,
  type JobStatus,
  type OptimizationJob,
  type OptimizationJobRequest,
  type Truck,
  type TruckType,
} from '../types'
import { createImportStore, locateInGazetteer, readWorkbookInBrowser, type WorkbookReader } from './import/importStore'
import { createShipmentEditor } from './shipmentEdit'
import { buildLoadPlan } from './loadPlan'
import { shortenIds } from '../../domain/shipmentIds'
import { assertValidTruck, assertValidTruckType, cleanTruckInput, toTruckType } from '../truckValidation'

export interface MockApiOptions {
  scenario: Scenario
  /** reads uploaded .xlsx files; tests pass a fake */
  readWorkbook?: WorkbookReader
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
  /** "Sačuvaj" (NOT IN SPEC v2): as on the device, only saved jobs are listed */
  saved: boolean
  name: string | null
}

/**
 * In-memory ApiClient over a fixture scenario. Every job on a scenario ends with the
 * scenario's fixed outcome; edits to trucks and imported shipments do not change it
 * (there is no solver here). Returned objects are copies, so callers cannot mutate
 * the mock's state.
 */
export function createMockApiClient(options: MockApiOptions): ApiClient {
  const {
    scenario,
    readWorkbook = readWorkbookInBrowser,
    latencyMs = 300,
    queuedMs = 800,
    runningMs = 3000,
    now = Date.now,
  } = options
  const trucks: Truck[] = structuredClone(scenario.trucks)
  const shipments = structuredClone(scenario.shipments)
  const locations = structuredClone(scenario.locations)
  const imports = createImportStore({ shipments, locations, readWorkbook })
  // Places are never removed: the scenario's fixed result names them.
  const editor = createShipmentEditor({ shipments, locations, locate: locateInGazetteer })
  const jobs = new Map<number, JobRecord>()
  // Truck types live only while the page does, as the rest of the mock's changes.
  const truckTypes: TruckType[] = []
  let nextTruckTypeId = 1
  let nextJobId = 1

  async function respond<T>(produce: () => T | Promise<T>): Promise<T> {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
    return structuredClone(await produce())
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
      saved: job.saved,
      name: job.name,
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

  function completedResult(id: number) {
    const view = jobView(findJob(id))
    if (view.status !== 'COMPLETED' || scenario.outcome.kind !== 'COMPLETED') {
      throw new ApiError({
        title: 'Rezultat nije dostupan',
        status: 409,
        detail: `Posao ${id} je u statusu ${view.status}; rezultat postoji samo za COMPLETED.`,
      })
    }
    return scenario.outcome.result
  }

  return {
    listLocations: () => respond(() => locations),
    listShipments: () => respond(() => shipments),
    // The places stay: the scenario's fixed result names them.
    deleteAllShipments: () =>
      respond(() => {
        const removed = shipments.length
        shipments.splice(0)
        return { shipments: removed, locations: 0 }
      }),
    updateShipment: (id, patch) => respond(() => editor.update(id, patch)),
    createShipment: (input) => respond(() => editor.create(input)),
    deleteShipment: (id) => respond(() => editor.remove(id)),
    shortenShipmentIds: () => respond(() => ({ renamed: shortenIds(shipments, locations) })),
    listTrucks: () => respond(() => trucks),
    getBase: () => respond(() => scenario.base),

    createTruck: (input) =>
      respond(() => {
        assertValidTruck(input)
        // The smallest id no truck has and the scenario's fixed result does not use (as on the device).
        const taken = new Set([
          ...trucks.map((t) => t.id),
          ...(scenario.outcome.kind === 'COMPLETED' ? scenario.outcome.result.routes.map((r) => r.truckId) : []),
        ])
        let id = 1
        while (taken.has(id)) id++
        const created: Truck = { ...cleanTruckInput(input), id }
        trucks.push(created)
        return created
      }),

    updateTruck: (id, input) =>
      respond(() => {
        const index = trucks.findIndex((t) => t.id === id)
        if (index < 0) throw notFound(`Kamion ${id} ne postoji.`)
        assertValidTruck(input)
        trucks[index] = { ...cleanTruckInput(input), id }
        return trucks[index]
      }),

    deleteTruck: (id) =>
      respond(() => {
        const index = trucks.findIndex((t) => t.id === id)
        if (index < 0) throw notFound(`Kamion ${id} ne postoji.`)
        // A running job may still use the truck; finished results keep their own snapshot.
        const running = [...jobs.values()].find((job) => !TERMINAL_JOB_STATUSES.includes(jobView(job).status))
        if (running) {
          throw new ApiError({
            title: 'Kamion se koristi',
            status: 409,
            detail: 'Optimizacija je u toku; kamion se može ukloniti kada se završi.',
          })
        }
        trucks.splice(index, 1)
      }),

    deleteAllTrucks: () =>
      respond(() => {
        const running = [...jobs.values()].find((job) => !TERMINAL_JOB_STATUSES.includes(jobView(job).status))
        if (running) {
          throw new ApiError({
            title: 'Optimizacija je u toku',
            status: 409,
            detail: 'Optimizacija je u toku; kamioni se mogu ukloniti kada se završi.',
          })
        }
        return trucks.splice(0)
      }),

    restoreTrucks: (removed) =>
      respond(() => {
        const taken = removed.find((r) => trucks.some((t) => t.id === r.id))
        if (taken) {
          throw new ApiError({ title: 'Kamioni nisu vraćeni', status: 409, detail: `Id ${taken.id} već ima kamion.` })
        }
        trucks.push(...structuredClone(removed))
        trucks.sort((a, b) => a.id - b.id)
        return removed
      }),

    listTruckTypes: () => respond(() => truckTypes),
    createTruckType: (input) =>
      respond(() => {
        assertValidTruckType(input, truckTypes, null)
        const created = toTruckType(nextTruckTypeId++, input)
        truckTypes.push(created)
        return created
      }),
    updateTruckType: (id, input) =>
      respond(() => {
        const index = truckTypes.findIndex((t) => t.id === id)
        if (index < 0) throw notFound(`Tip kamiona ${id} ne postoji.`)
        assertValidTruckType(input, truckTypes, id)
        truckTypes[index] = toTruckType(id, input)
        return truckTypes[index]
      }),
    deleteTruckType: (id) =>
      respond(() => {
        const index = truckTypes.findIndex((t) => t.id === id)
        if (index < 0) throw notFound(`Tip kamiona ${id} ne postoji.`)
        truckTypes.splice(index, 1)
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
        const job: JobRecord = { id: nextJobId++, createdAtMs: now(), timeLimitSeconds: request.timeLimitSeconds, saved: false, name: null }
        // A new job replaces the one not saved before it.
        for (const [id, other] of jobs) {
          if (!other.saved && TERMINAL_JOB_STATUSES.includes(jobView(other).status)) jobs.delete(id)
        }
        jobs.set(job.id, job)
        return { id: job.id, status: 'QUEUED' as JobStatus }
      }),

    getOptimizationJob: (id) => respond(() => jobView(findJob(id))),

    getLatestOptimizationJob: () =>
      respond(() => {
        const latest = Math.max(0, ...jobs.keys())
        return latest > 0 ? jobView(findJob(latest)) : null
      }),

    getOptimizationHistory: () => respond(() => [...jobs.values()].map((job) => iso(job.createdAtMs))),

    // The scenario's fixed result for every completed job, as getOptimizationResult gives it.
    listOptimizationJobs: () =>
      respond(() =>
        [...jobs.values()]
          .filter((record) => record.saved)
          .sort((a, b) => b.id - a.id)
          .map((record) => {
            const job = jobView(record)
            const result = job.status === 'COMPLETED' && scenario.outcome.kind === 'COMPLETED' ? scenario.outcome.result : null
            return {
              job,
              name: record.name?.trim() || defaultJobName(result),
              shipmentCount: shipments.length,
              trucksUsed: result?.trucksUsed ?? null,
              totalMeters: result?.totalMeters ?? null,
              unassignedCount: result ? result.unassignedShipmentIds.length : null,
              truckNames: (result?.routes ?? []).map((r) => trucks.find((t) => t.id === r.truckId)?.name ?? `Kamion #${r.truckId}`),
              manual: false,
            }
          }),
      ),

    // The mock's jobs follow a fixed course; only the application on the device stops one.
    cancelOptimizationJob: () =>
      Promise.reject(new ApiError({ title: 'Ne postoji', status: 404, detail: 'Probni podaci nemaju prekidanje poslova.' })),

    saveOptimizationJob: (id, name) =>
      respond(() => {
        const record = findJob(id)
        if (!record.saved && (jobView(record).status !== 'COMPLETED' || scenario.outcome.kind !== 'COMPLETED')) {
          throw new ApiError({ title: 'Nema rezultata', status: 409, detail: 'Sačuvati se može samo završena optimizacija.' })
        }
        record.saved = true
        record.name = name?.trim() || null
        return jobView(record)
      }),

    deleteOptimizationJob: (id) =>
      respond(() => {
        const job = jobView(findJob(id))
        if (job.status === 'QUEUED' || job.status === 'RUNNING') {
          throw new ApiError({ title: 'Optimizacija je u toku', status: 409, detail: 'Optimizacija još nije završena.' })
        }
        jobs.delete(id)
      }),

    getOptimizationResult: (id) => respond(() => completedResult(id)),

    getLoadPlan: (jobId, truckId) =>
      respond(() => {
        const result = completedResult(jobId)
        const truck = trucks.find((t) => t.id === truckId)
        if (!truck) throw notFound(`Kamion ${truckId} ne postoji.`)
        return buildLoadPlan(jobId, result, truck, shipments)
      }),

    // The mock has no roads: the map draws straight lines.
    getRouteLine: (jobId) =>
      respond(() => {
        completedResult(jobId)
        return null
      }),

    createImport: (file) => respond(() => imports.create(file)),
    setImportMapping: (importId, mapping) => respond(() => imports.setMapping(importId, mapping)),
    getImportPreview: (importId) => respond(() => imports.preview(importId)),
    updateImportRow: (importId, rowNumber, patch) => respond(() => imports.updateRow(importId, rowNumber, patch)),
    commitImport: (importId, commitOptions) => respond(() => imports.commit(importId, commitOptions?.onProgress)),

    // Trucks have no location in the mock: its result is fixed per scenario.
    getTruckStarts: () => respond(() => null),
    setTruckStart: () =>
      respond(() => {
        throw notFound('Lokacije kamiona postoje samo u aplikaciji na uređaju.')
      }),
    getDeviceSettings: () => respond(() => null),
    updateDeviceSettings: () =>
      respond(() => {
        throw notFound('Podešavanja postoje samo u aplikaciji na uređaju.')
      }),
    exportDeviceData: () => respond(() => null),
    checkDeviceData: () =>
      respond(() => {
        throw notFound('Izvoz i uvoz podataka postoje samo u aplikaciji na uređaju.')
      }),

    checkShipmentLayout: () =>
      respond(() => {
        throw notFound('Uvoz rasporeda iz smartLoad+ postoji samo u aplikaciji na uređaju.')
      }),
    applyShipmentLayout: () =>
      respond(() => {
        throw notFound('Uvoz rasporeda iz smartLoad+ postoji samo u aplikaciji na uređaju.')
      }),
    removeShipmentLayout: () =>
      respond(() => {
        throw notFound('Uvoz rasporeda iz smartLoad+ postoji samo u aplikaciji na uređaju.')
      }),

    reassignShipment: () =>
      respond(() => {
        throw notFound('Ručna preraspodela pošiljki postoji samo u aplikaciji na uređaju.')
      }),

    restoreOptimizedResult: () =>
      respond(() => {
        throw notFound('Ručna preraspodela pošiljki postoji samo u aplikaciji na uređaju.')
      }),

    saveLoadPlan: () =>
      respond(() => {
        throw notFound('Ručno uređivanje rasporeda postoji samo u aplikaciji na uređaju.')
      }),
    resetLoadPlan: () =>
      respond(() => {
        throw notFound('Ručno uređivanje rasporeda postoji samo u aplikaciji na uređaju.')
      }),

    restoreRoadPoint: () =>
      respond(() => {
        throw notFound('Najbliži put za kamione postoji samo u aplikaciji na uređaju.')
      }),

    searchPlaceAgain: () =>
      respond(() => {
        throw notFound('Ponovno traženje mesta postoji samo u aplikaciji na uređaju.')
      }),

    applyPlaceSearch: () =>
      respond(() => {
        throw notFound('Ponovno traženje mesta postoji samo u aplikaciji na uređaju.')
      }),

    forgetAllPlaces: () =>
      respond(() => {
        throw notFound('Zaboravljanje lokacija postoji samo u aplikaciji na uređaju.')
      }),

    resetDevice: () =>
      respond(() => {
        throw notFound('Brisanje svih podataka postoji samo u aplikaciji na uređaju.')
      }),
    replaceDeviceData: () =>
      respond(() => {
        throw notFound('Izvoz i uvoz podataka postoje samo u aplikaciji na uređaju.')
      }),
  }
}

function notFound(detail: string): ApiError {
  return new ApiError({ title: 'Ne postoji', status: 404, detail })
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}
