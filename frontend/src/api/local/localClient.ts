import type { Scenario } from '../../fixtures'
import { STANDARD_TRUCK } from '../../domain/fleet'
import { haversineMatrix } from '../../domain/optimization/distance'
import { provenCauses } from '../../domain/optimization/feasibility'
import type { JobInput, JobTruck } from '../../domain/optimization/job'
import { toSolverInput } from '../../domain/optimization/job'
import { rearLoadedPlan } from '../../domain/optimization/loadPlan'
import { toOptimizationResult } from '../../domain/optimization/result'
import { OPEN_ROUTE_REAR_LOADING } from '../../domain/optimization/routePlanner'
import { isFeasible, type Score } from '../../domain/optimization/solver'
import type { SolverRunner } from '../../domain/optimization/solverRunner'
import { ApiError, type ApiClient } from '../client'
import { createImportStore, readWorkbookInBrowser, type WorkbookReader } from '../mock/import/importStore'
import { assertValidTruck } from '../truckValidation'
import {
  TERMINAL_JOB_STATUSES,
  type InfeasibilityKind,
  type JobStatus,
  type OptimizationJob,
  type OptimizationJobRequest,
  type OptimizationResult,
  type Shipment,
  type Truck,
} from '../types'

// The application on the device (path B): the same API as the backend, but everything
// runs here. Shipments, locations and trucks start from a fixture scenario and live in
// memory (storage on the device comes later); the Excel import is the mock's. A job
// really solves: the checks before solving (422 PROVEN), the TS solver in a Web Worker,
// the independent validator and the rear-loaded 3D plan, with the process owner's model
// (open routes, loading from the rear, weight).
//
// Fleet (B1): the job may use every available truck plus as many standard trucks as it
// needs, so the number of trucks is not limited; the standard trucks a result uses are
// added to the trucks list as "Kamion N" when the job completes.
// Distances are great-circle for now (no road distances yet), as on the backend.

export interface LocalApiOptions {
  scenario: Scenario
  runSolver: SolverRunner
  readWorkbook?: WorkbookReader
}

interface LocalJob {
  id: number
  status: JobStatus
  infeasibilityKind: InfeasibilityKind | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  timeLimitSeconds: number
  score: Score | null
  trucksLowerBound: number | null
  input: JobInput
  /** cargo space of every truck in the job, as it was when the job was created */
  fleet: Map<number, Truck>
  /** ids of the standard trucks added for this job; only the used ones are kept */
  addedTruckIds: Set<number>
  result: OptimizationResult | null
}

export function createLocalApiClient(options: LocalApiOptions): ApiClient {
  const { scenario, runSolver, readWorkbook = readWorkbookInBrowser } = options
  const trucks: Truck[] = structuredClone(scenario.trucks)
  const shipments = structuredClone(scenario.shipments)
  const locations = structuredClone(scenario.locations)
  const imports = createImportStore({ shipments, locations, readWorkbook })
  const jobs = new Map<number, LocalJob>()
  let nextTruckId = Math.max(0, ...trucks.map((t) => t.id)) + 1
  let nextJobId = 1
  // Jobs run one at a time, in the order they were created (as on the backend).
  let queue: Promise<void> = Promise.resolve()

  async function respond<T>(produce: () => T | Promise<T>): Promise<T> {
    return structuredClone(await produce())
  }

  function findJob(id: number): LocalJob {
    const job = jobs.get(id)
    if (!job) throw notFound(`Posao optimizacije ${id} ne postoji.`)
    return job
  }

  function completedResult(job: LocalJob): OptimizationResult {
    if (job.status !== 'COMPLETED' || !job.result) {
      throw new ApiError({
        title: 'Rezultat nije dostupan',
        status: 409,
        detail: `Posao ${job.id} je u statusu ${job.status}; rezultat postoji samo za COMPLETED.`,
      })
    }
    return job.result
  }

  function activeJob(): LocalJob | undefined {
    return [...jobs.values()].find((job) => !TERMINAL_JOB_STATUSES.includes(job.status))
  }

  function createJob(request: OptimizationJobRequest): LocalJob {
    if (!(request.timeLimitSeconds > 0)) {
      throw badRequest({ timeLimitSeconds: 'Vremensko ograničenje mora biti veće od 0.' })
    }
    const errors: Record<string, string> = {}
    const chosenTrucks = select(trucks, request.truckIds, 'truckIds', 'Kamion', errors)
    const chosenShipments = select(shipments, request.shipmentIds, 'shipmentIds', 'Pošiljka', errors)
    if (Object.keys(errors).length > 0) throw badRequest(errors)
    if (chosenShipments.length === 0) {
      throw new ApiError({ title: 'Neispravan zahtev', status: 400, detail: 'Nema pošiljki za optimizaciju.' })
    }
    const used = usedLocations(chosenShipments)
    requireCoordinates(chosenShipments, used)

    // Unavailable trucks are not sent to the solver; standard trucks fill up the fleet.
    const own = chosenTrucks.filter((t) => t.available)
    const added = Array.from({ length: chosenShipments.length }, (): Truck => ({
      id: nextTruckId++,
      name: '',
      capacityLdmTenths: STANDARD_TRUCK.capacityLdmTenths,
      available: true,
      innerLengthMm: STANDARD_TRUCK.innerLengthMm,
      innerWidthMm: STANDARD_TRUCK.innerWidthMm,
      innerHeightMm: STANDARD_TRUCK.innerHeightMm,
    }))
    const jobTrucks: JobTruck[] = [
      ...own.map((t) => ({ id: t.id, name: t.name, capacityLdmTenths: t.capacityLdmTenths, capacityKg: Infinity })),
      ...added.map((t) => ({ id: t.id, name: 'Standardna cerada', capacityLdmTenths: t.capacityLdmTenths, capacityKg: STANDARD_TRUCK.capacityKg })),
    ]
    const causes = provenCauses(chosenShipments, jobTrucks)
    if (causes.length > 0) {
      throw new ApiError({
        title: 'Dokazano neizvodljivo',
        status: 422,
        detail: 'Provera pre pokretanja je dokazala da rešenje ne postoji. Solver nije pokrenut.',
        infeasibilityKind: 'PROVEN',
        causes,
      })
    }

    const job: LocalJob = {
      id: nextJobId++,
      status: 'QUEUED',
      infeasibilityKind: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      timeLimitSeconds: request.timeLimitSeconds,
      score: null,
      trucksLowerBound: null,
      input: {
        shipments: structuredClone(chosenShipments),
        trucks: jobTrucks,
        locationIds: used.map((l) => l.id),
        distance: haversineMatrix(used.map((l) => ({ lat: l.lat as number, lon: l.lon as number }))),
        rules: OPEN_ROUTE_REAR_LOADING,
      },
      fleet: new Map([...own, ...added].map((t) => [t.id, structuredClone(t)])),
      addedTruckIds: new Set(added.map((t) => t.id)),
      result: null,
    }
    jobs.set(job.id, job)
    queue = queue.then(() => run(job))
    return job
  }

  async function run(job: LocalJob): Promise<void> {
    job.status = 'RUNNING'
    job.startedAt = new Date().toISOString()
    try {
      const solution = await runSolver(toSolverInput(job.input), { timeLimitMs: job.timeLimitSeconds * 1000 })
      job.score = solution.score
      if (isFeasible(solution.score)) {
        const result = toOptimizationResult(
          job.input,
          solution.routes.map((r) => ({ truckId: r.truckId, route: r.route })),
        )
        job.result = { ...result, openRoute: true }
        job.trucksLowerBound = result.trucksLowerBound
        keepUsedStandardTrucks(job, result)
        job.status = 'COMPLETED'
      } else {
        job.status = 'INFEASIBLE'
        job.infeasibilityKind = 'NOT_FOUND'
      }
    } catch (error) {
      console.error(`Optimization job ${job.id} failed`, error)
      job.status = 'FAILED'
    }
    job.finishedAt = new Date().toISOString()
  }

  /** The application makes the trucks (B1): used standard trucks join the list as "Kamion N". */
  function keepUsedStandardTrucks(job: LocalJob, result: OptimizationResult): void {
    for (const route of result.routes) {
      const truck = job.fleet.get(route.truckId)
      if (!truck || !job.addedTruckIds.has(truck.id)) continue
      truck.name = nextStandardName()
      trucks.push(structuredClone(truck))
    }
  }

  function nextStandardName(): string {
    const names = new Set(trucks.map((t) => t.name))
    let n = 1
    while (names.has(`Kamion ${n}`)) n++
    return `Kamion ${n}`
  }

  function usedLocations(chosen: Shipment[]) {
    const ids = new Set(chosen.flatMap((s) => [s.pickupLocationId, s.deliveryLocationId]))
    return locations.filter((l) => ids.has(l.id)).sort((a, b) => a.id - b.id)
  }

  /** 409 as on the backend: distances need coordinates. */
  function requireCoordinates(chosen: Shipment[], used: typeof locations): void {
    const withCoordinates = new Set(used.filter((l) => l.lat !== null && l.lon !== null).map((l) => l.id))
    const unclear = chosen
      .filter((s) => !withCoordinates.has(s.pickupLocationId) || !withCoordinates.has(s.deliveryLocationId))
      .map((s) => s.externalId)
    if (unclear.length > 0) {
      throw new ApiError({
        title: 'Nejasne lokacije',
        status: 409,
        detail:
          `Pošiljke sa nejasnom lokacijom (${unclear.length}): ${unclear.join(', ')}. ` +
          'Bez koordinata ne mogu da uđu u rutu; ispravite ih ili ih izostavite iz optimizacije.',
      })
    }
  }

  function view(job: LocalJob): OptimizationJob {
    return {
      id: job.id,
      status: job.status,
      infeasibilityKind: job.infeasibilityKind,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      timeLimitSeconds: job.timeLimitSeconds,
      scoreHard: job.score?.hard ?? null,
      scoreMedium: job.score?.medium ?? null,
      scoreSoft: job.score?.soft ?? null,
      feasible: job.status === 'COMPLETED' ? true : job.status === 'INFEASIBLE' ? false : null,
      trucksLowerBound: job.trucksLowerBound,
    }
  }

  return {
    listLocations: () => respond(() => locations),
    listShipments: () => respond(() => shipments),
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

    deleteTruck: (id) =>
      respond(() => {
        const index = trucks.findIndex((t) => t.id === id)
        if (index < 0) throw notFound(`Kamion ${id} ne postoji.`)
        const running = activeJob()
        if (running) {
          throw new ApiError({
            title: 'Kamion se koristi',
            status: 409,
            detail: `Optimizacija #${running.id} je u toku; kamion se može ukloniti kada se završi.`,
          })
        }
        trucks.splice(index, 1)
      }),

    createOptimizationJob: (request) =>
      respond(() => {
        const job = createJob(request)
        return { id: job.id, status: job.status }
      }),

    getOptimizationJob: (id) => respond(() => view(findJob(id))),

    getOptimizationResult: (id) => respond(() => completedResult(findJob(id))),

    getLoadPlan: (jobId, truckId) =>
      respond(() => {
        const job = findJob(jobId)
        const result = completedResult(job)
        const truck = job.fleet.get(truckId)
        if (!truck) throw notFound(`Kamion ${truckId} nije u poslu ${jobId}.`)
        const route = result.routes.find((r) => r.truckId === truckId)
        if (!route) throw notFound(`Kamion ${truckId} nema rutu u poslu ${jobId}.`)
        const { innerLengthMm, innerWidthMm, innerHeightMm } = truck
        if (innerLengthMm === null || innerWidthMm === null || innerHeightMm === null) {
          throw new ApiError({
            title: 'Nedostaju dimenzije kamiona',
            status: 409,
            detail: `Kamion „${truck.name}“ nema unete dimenzije tovarnog prostora; 3D raspored nije moguć.`,
          })
        }
        return rearLoadedPlan(jobId, route, { innerLengthMm, innerWidthMm, innerHeightMm }, job.input.shipments)
      }),

    createImport: (file) => respond(() => imports.create(file)),
    setImportMapping: (importId, mapping) => respond(() => imports.setMapping(importId, mapping)),
    getImportPreview: (importId) => respond(() => imports.preview(importId)),
    updateImportRow: (importId, rowNumber, patch) => respond(() => imports.updateRow(importId, rowNumber, patch)),
    commitImport: (importId) => respond(() => imports.commit(importId)),
  }
}

/** The wanted items in the wanted order (all when null); unknown ids go into `errors`. */
function select<T extends { id: number }>(
  all: T[],
  wanted: number[] | null,
  field: string,
  noun: string,
  errors: Record<string, string>,
): T[] {
  if (wanted === null) return all
  const byId = new Map(all.map((item) => [item.id, item]))
  const unknown = wanted.filter((id) => !byId.has(id))
  if (unknown.length > 0) {
    errors[field] = `${noun} ne postoji: ${unknown.join(', ')}.`
    return []
  }
  return [...new Set(wanted)].map((id) => byId.get(id) as T)
}

function badRequest(errors: Record<string, string>): ApiError {
  return new ApiError({ title: 'Neispravan zahtev', status: 400, errors })
}

function notFound(detail: string): ApiError {
  return new ApiError({ title: 'Ne postoji', status: 404, detail })
}
