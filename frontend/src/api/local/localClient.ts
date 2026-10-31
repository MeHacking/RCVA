import type { Scenario } from '../../fixtures'
import { STANDARD_TRUCK } from '../../domain/fleet'
import { haversineMatrix, type LatLon } from '../../domain/optimization/distance'
import { provenCauses } from '../../domain/optimization/feasibility'
import type { JobInput, JobTruck } from '../../domain/optimization/job'
import { toSolverInput } from '../../domain/optimization/job'
import { rearLoadedPlan } from '../../domain/optimization/loadPlan'
import { toOptimizationResult } from '../../domain/optimization/result'
import { OPEN_ROUTE_REAR_LOADING } from '../../domain/optimization/routePlanner'
import { isFeasible, type Score } from '../../domain/optimization/solver'
import type { SolverRunner } from '../../domain/optimization/solverRunner'
import { ApiError, type ApiClient } from '../client'
import {
  createImportStore,
  readWorkbookInBrowser,
  type PlaceLocator,
  type WorkbookReader,
} from '../mock/import/importStore'
import type { PlaceWarning } from '../mock/import/importRows'
import { assertValidTruck } from '../truckValidation'
import { DeviceStoreError, type DeviceStore } from './deviceStore'
import { createNominatimGeocoder, GeocodeError, placeKey, type GeocodeAnswer } from './nominatim'
import { createOrsDistances, pairKey, RoadDistanceError } from './openRouteService'
import {
  TERMINAL_JOB_STATUSES,
  type DeviceSettings,
  type DistanceSource,
  type InfeasibilityKind,
  type JobStatus,
  type Location,
  type OptimizationJob,
  type OrsProfile,
  type OptimizationJobRequest,
  type OptimizationResult,
  type Shipment,
  type Truck,
} from '../types'

// The application on the device (path B): the same API as the backend, but everything
// runs here. Shipments, locations, trucks and the last jobs are kept on the device
// (`DeviceStore`, IndexedDB in the browser) and written after every change; a fixture
// scenario is only the start, when nothing is stored yet. The Excel import is the mock's,
// and an import that is not committed yet is not kept; committing it looks up the
// coordinates of its places with Nominatim (nominatim.ts), and every answer is kept, so
// a place is never asked twice. A job
// really solves: the checks before solving (422 PROVEN), the TS solver in a Web Worker,
// the independent validator and the rear-loaded 3D plan, with the process owner's model
// (open routes, loading from the rear, weight).
//
// Fleet (B1): the job may use every available truck plus as many standard trucks as it
// needs, so the number of trucks is not limited; the standard trucks a result uses are
// added to the trucks list as "Kamion N" when the job completes.
//
// Distances: by road from OpenRouteService (openRouteService.ts) when the settings have
// an ORS key, asked only for pairs of places not asked before and kept on the device;
// without a key, great-circle (as on the backend), and the result says which. When ORS
// does not answer, no job is created (502): never a silent switch to great-circle.

export interface LocalApiOptions {
  /** the starting data, used only when the store is empty */
  scenario: Scenario
  runSolver: SolverRunner
  store: DeviceStore<LocalData>
  readWorkbook?: WorkbookReader
  /** how Nominatim is reached; tests give a fake fetch and no pause between requests */
  nominatim?: { fetch: typeof fetch; minIntervalMs?: number }
  /** how OpenRouteService is reached; the same for tests */
  ors?: { fetch: typeof fetch; minIntervalMs?: number }
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  geocodingEnabled: true,
  contactEmail: null,
  orsApiKey: null,
  orsProfile: 'driving-hgv',
}

const PROFILE_LABELS: Record<OrsProfile, string> = { 'driving-hgv': 'za teretna vozila', 'driving-car': 'za automobile' }

/** Jobs kept on the device; older finished jobs are dropped (the screens show only the last one). */
export const KEPT_JOBS = 10

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
  /** missing in jobs stored before road distances existed */
  distanceSource?: DistanceSource
}

/** Everything the store keeps. Fields added later are optional, so older snapshots still load. */
export interface LocalData {
  shipments: Shipment[]
  locations: Location[]
  trucks: Truck[]
  jobs: LocalJob[]
  nextTruckId: number
  nextJobId: number
  settings?: DeviceSettings
  /** Nominatim answers by `placeKey`, also "not found"; failed requests are not kept */
  geocodeCache?: Record<string, GeocodeAnswer>
  /** ORS metres by `roadKey` (profile and both coordinates, directed); null: ORS finds no road */
  distanceCache?: Record<string, number | null>
}

/** Coordinates written to 6 decimals (about 10 cm), so a moved place is a new pair. */
function roadKey(profile: OrsProfile, from: LatLon, to: LatLon): string {
  const point = (p: LatLon) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
  return `${profile}|${point(from)}|${point(to)}`
}

export function createLocalApiClient(options: LocalApiOptions): ApiClient {
  const {
    scenario,
    runSolver,
    store,
    readWorkbook = readWorkbookInBrowser,
    nominatim = { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) },
    ors = { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) },
  } = options
  // Filled from the store (or the scenario) before the first call is answered; the arrays
  // stay the same objects, since the import writes into them.
  const trucks: Truck[] = []
  const shipments: Shipment[] = []
  const locations: Location[] = []
  const jobs = new Map<number, LocalJob>()
  let nextTruckId = 1
  let nextJobId = 1
  let settings: DeviceSettings = { ...DEFAULT_SETTINGS }
  let geocodeCache: Record<string, GeocodeAnswer> = {}
  let distanceCache: Record<string, number | null> = {}
  const roadDistances = createOrsDistances(ors)
  const geocoder = createNominatimGeocoder({
    fetch: nominatim.fetch,
    minIntervalMs: nominatim.minIntervalMs,
    contactEmail: () => settings.contactEmail,
  })

  const locate: PlaceLocator = async (place) => {
    if (!settings.geocodingEnabled) {
      return { kind: 'failed', message: 'Traženje koordinata je isključeno u podešavanjima.' }
    }
    const key = placeKey(place)
    let answer = geocodeCache[key]
    if (!answer) {
      try {
        answer = await geocoder.geocode(place)
      } catch (error) {
        if (error instanceof GeocodeError) return { kind: 'failed', message: error.message }
        throw error
      }
      geocodeCache[key] = answer
      // Kept at once, so a reload in the middle of an import does not ask again.
      await persist()
    }
    return answer.found ? { kind: 'found', lat: answer.lat, lon: answer.lon } : { kind: 'notFound' }
  }
  // The preview asks nothing; it only knows what an earlier import was answered.
  const placeWarning: PlaceWarning = (place) =>
    geocodeCache[placeKey(place)]?.found === false
      ? `Nominatim ranije nije pronašao „${place.name}“; pošiljka će imati status „Nejasna lokacija“.`
      : null
  const imports = createImportStore({ shipments, locations, readWorkbook, locate, placeWarning })
  // Jobs run one at a time, in the order they were created (as on the backend).
  let queue: Promise<void> = Promise.resolve()
  // Writes go one after another; each writes the state as it is when its turn comes.
  let saving: Promise<void> = Promise.resolve()
  const ready = restore()

  async function restore(): Promise<void> {
    const stored = await store.load()
    const data = stored ?? {
      shipments: structuredClone(scenario.shipments),
      locations: structuredClone(scenario.locations),
      trucks: structuredClone(scenario.trucks),
      jobs: [],
      nextTruckId: Math.max(0, ...scenario.trucks.map((t) => t.id)) + 1,
      nextJobId: 1,
    }
    shipments.push(...data.shipments)
    locations.push(...data.locations)
    trucks.push(...data.trucks)
    nextTruckId = data.nextTruckId
    nextJobId = data.nextJobId
    settings = { ...DEFAULT_SETTINGS, ...data.settings }
    geocodeCache = data.geocodeCache ?? {}
    distanceCache = data.distanceCache ?? {}
    let interrupted = false
    for (const job of data.jobs) {
      // The page was closed while the job waited or ran; its solver is gone.
      if (!TERMINAL_JOB_STATUSES.includes(job.status)) {
        job.status = 'FAILED'
        job.finishedAt = new Date().toISOString()
        interrupted = true
      }
      jobs.set(job.id, job)
    }
    if (!stored || interrupted) await persist()
  }

  function persist(): Promise<void> {
    const write = saving.then(() =>
      store.save({
        shipments,
        locations,
        trucks,
        jobs: [...jobs.values()],
        nextTruckId,
        nextJobId,
        settings,
        geocodeCache,
        distanceCache,
      }),
    )
    saving = write.catch(() => undefined)
    return write
  }

  /** For changes made while a job runs, when nobody waits for the answer. */
  function persistInBackground(): void {
    persist().catch((error: unknown) => console.error('Saving on the device failed', error))
  }

  async function respond<T>(produce: () => T | Promise<T>): Promise<T> {
    try {
      await ready
      return structuredClone(await produce())
    } catch (error) {
      if (error instanceof DeviceStoreError) {
        throw new ApiError({ title: 'Podaci na uređaju', status: 500, detail: error.message })
      }
      throw error
    }
  }

  /** A change: answered only once it is stored. */
  function change<T>(produce: () => T | Promise<T>): Promise<T> {
    return respond(async () => {
      const value = await produce()
      await persist()
      return value
    })
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

  async function createJob(request: OptimizationJobRequest): Promise<LocalJob> {
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
      capacityKg: STANDARD_TRUCK.capacityKg,
      available: true,
      innerLengthMm: STANDARD_TRUCK.innerLengthMm,
      innerWidthMm: STANDARD_TRUCK.innerWidthMm,
      innerHeightMm: STANDARD_TRUCK.innerHeightMm,
    }))
    const jobTrucks: JobTruck[] = [
      ...own.map((t) => ({ id: t.id, name: t.name, capacityLdmTenths: t.capacityLdmTenths, capacityKg: t.capacityKg ?? Infinity })),
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
    // After the checks above, so a job that cannot start costs no ORS request.
    const { distance, source } = await jobDistances(used)

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
        distance,
        rules: OPEN_ROUTE_REAR_LOADING,
      },
      fleet: new Map([...own, ...added].map((t) => [t.id, structuredClone(t)])),
      addedTruckIds: new Set(added.map((t) => t.id)),
      result: null,
      distanceSource: source,
    }
    jobs.set(job.id, job)
    dropOldJobs()
    queue = queue.then(() => run(job))
    return job
  }

  /** The distance matrix over the job's places: by road with an ORS key, otherwise great-circle. */
  async function jobDistances(used: Location[]): Promise<{ distance: number[][]; source: DistanceSource }> {
    const points = used.map((l) => ({ lat: l.lat as number, lon: l.lon as number }))
    const apiKey = settings.orsApiKey
    if (!apiKey) return { distance: haversineMatrix(points), source: 'airline' }

    const profile = settings.orsProfile
    const key = (i: number, j: number) => roadKey(profile, points[i], points[j])
    // Two places at the same point are 0 m apart; every other pair is asked once, ever.
    const same = (i: number, j: number) => key(i, j) === key(j, i)
    const missing: Array<[number, number]> = []
    points.forEach((_, i) =>
      points.forEach((_, j) => {
        if (!same(i, j) && !Object.hasOwn(distanceCache, key(i, j))) missing.push([i, j])
      }),
    )
    if (missing.length > 0) {
      let answers: Map<string, number | null>
      try {
        answers = await roadDistances(points, missing, { apiKey, profile })
      } catch (error) {
        if (!(error instanceof RoadDistanceError)) throw error
        throw new ApiError({ title: 'Kilometraže nisu dostupne', status: 502, detail: error.message })
      }
      for (const [i, j] of missing) distanceCache[key(i, j)] = answers.get(pairKey(i, j)) as number | null
      await persist()
    }

    const noRoad: string[] = []
    const distance = points.map((_, i) =>
      points.map((_, j) => {
        if (same(i, j)) return 0
        const meters = distanceCache[key(i, j)]
        if (meters === null) noRoad.push(`${used[i].name} → ${used[j].name}`)
        return meters ?? 0
      }),
    )
    if (noRoad.length > 0) {
      throw new ApiError({
        title: 'Nema puta',
        status: 409,
        detail:
          `OpenRouteService ne nalazi put ${PROFILE_LABELS[profile]} (${noRoad.length}): ` +
          `${noRoad.slice(0, 5).join(', ')}${noRoad.length > 5 ? ` i još ${noRoad.length - 5}` : ''}. ` +
          'Proverite koordinate tih mesta.',
      })
    }
    return { distance, source: profile }
  }

  function dropOldJobs(): void {
    const ids = [...jobs.keys()].sort((a, b) => b - a)
    for (const id of ids.slice(KEPT_JOBS)) {
      if (TERMINAL_JOB_STATUSES.includes((jobs.get(id) as LocalJob).status)) jobs.delete(id)
    }
  }

  async function run(job: LocalJob): Promise<void> {
    job.status = 'RUNNING'
    job.startedAt = new Date().toISOString()
    persistInBackground()
    try {
      const solution = await runSolver(toSolverInput(job.input), { timeLimitMs: job.timeLimitSeconds * 1000 })
      job.score = solution.score
      if (isFeasible(solution.score)) {
        const result = toOptimizationResult(
          job.input,
          solution.routes.map((r) => ({ truckId: r.truckId, route: r.route })),
        )
        job.result = { ...result, openRoute: true, distanceSource: job.distanceSource }
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
    persistInBackground()
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
      change(() => {
        assertValidTruck(input)
        const created: Truck = { ...input, id: nextTruckId++ }
        trucks.push(created)
        return created
      }),

    updateTruck: (id, input) =>
      change(() => {
        const index = trucks.findIndex((t) => t.id === id)
        if (index < 0) throw notFound(`Kamion ${id} ne postoji.`)
        assertValidTruck(input)
        trucks[index] = { ...input, id }
        return trucks[index]
      }),

    deleteTruck: (id) =>
      change(() => {
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
      change(async () => {
        const job = await createJob(request)
        // As created (202 on the backend); the queue may have started it already.
        return { id: job.id, status: 'QUEUED' as const }
      }),

    getOptimizationJob: (id) => respond(() => view(findJob(id))),

    getLatestOptimizationJob: () =>
      respond(() => {
        const latest = Math.max(0, ...jobs.keys())
        return latest > 0 ? view(findJob(latest)) : null
      }),

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
    commitImport: (importId, commitOptions) => change(() => imports.commit(importId, commitOptions?.onProgress)),

    getDeviceSettings: () => respond(() => settings),

    updateDeviceSettings: (input) =>
      change(() => {
        const errors: Record<string, string> = {}
        const contactEmail = input.contactEmail?.trim() || null
        if (contactEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
          errors.contactEmail = 'Unesite ispravnu e-adresu ili ostavite polje prazno.'
        }
        const orsApiKey = input.orsApiKey?.trim() || null
        if (orsApiKey !== null && /\s/.test(orsApiKey)) errors.orsApiKey = 'Ključ ne sme da sadrži razmake.'
        if (!Object.hasOwn(PROFILE_LABELS, input.orsProfile)) errors.orsProfile = 'Nepoznata vrsta vozila.'
        if (Object.keys(errors).length > 0) throw badRequest(errors)
        settings = { geocodingEnabled: input.geocodingEnabled, contactEmail, orsApiKey, orsProfile: input.orsProfile }
        return settings
      }),
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
