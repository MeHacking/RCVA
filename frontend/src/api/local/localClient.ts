import type { Scenario } from '../../fixtures'
import { missingTrucks, standardJobTruck, toJobTruck } from '../../domain/fleet'
import { haversineMatrix, type LatLon } from '../../domain/optimization/distance'
import { provenFindings } from '../../domain/optimization/feasibility'
import type { JobInput, JobTruck } from '../../domain/optimization/job'
import { toSolverInput } from '../../domain/optimization/job'
import { rearLoadedPlan } from '../../domain/optimization/loadPlan'
import { toOptimizationResult } from '../../domain/optimization/result'
import { OPEN_ROUTE_REAR_LOADING } from '../../domain/optimization/routePlanner'
import { isFeasible, type Score, type SolverInput } from '../../domain/optimization/solver'
import type { SolverRunner } from '../../domain/optimization/solverRunner'
import { ApiError, type ApiClient } from '../client'
import {
  createImportStore,
  readWorkbookInBrowser,
  type PlaceLocator,
  type WorkbookReader,
} from '../mock/import/importStore'
import type { PlaceWarning } from '../mock/import/importRows'
import { createShipmentEditor } from '../mock/shipmentEdit'
import { assertValidTruck } from '../truckValidation'
import { deviceFileName, DeviceFileError, readDeviceFile, writeDeviceFile } from './deviceFile'
import { DeviceStoreError, type DeviceStore } from './deviceStore'
import { createNominatimGeocoder, GeocodeError, placeKey, type GeocodeAnswer } from './nominatim'
import { createOrsDistances, createOrsLines, pairKey, RoadDistanceError } from './openRouteService'
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
  type RouteLine,
  type Shipment,
  type Truck,
  type TruckStart,
  type TruckStartResult,
} from '../types'

// The application on the device (path B): the same API as the backend, but everything
// runs here. Shipments, locations, trucks and the last jobs are kept on the device
// (`DeviceStore`, IndexedDB in the browser) and written after every change; a fixture
// scenario is only the start, when nothing is stored yet. The Excel import is the mock's,
// and an import that is not committed yet is not kept; committing it looks up the
// coordinates of its places with Nominatim (nominatim.ts), and every answer is kept, so
// a place is never asked twice. A shipment can be corrected after the import
// (shipmentEdit.ts); then only its places without coordinates are looked up. A job
// really solves: the checks before solving (422 PROVEN), the TS solver in a Web Worker,
// the independent validator and the rear-loaded 3D plan, with the process owner's model
// (open routes, loading from the rear, weight).
//
// Fleet: a job uses the available trucks in the list, and each needs to know where it is
// (`startLocationId`, confirmed by the user; the last delivery of a later job is only a
// proposal); its route starts there. When the trucks are not enough the job is refused
// (422) with the number of standard trucks missing, or, if the user asks for it
// (`allowUnassigned`), planned without the shipments that do not fit. After a job the same
// shipments are solved again with one more truck, and when that saves enough kilometres
// (the setting `extraTruckSavingPercent`) the result advises it (`extraTruck`).
//
// Distances: by road from OpenRouteService (openRouteService.ts) when the settings have
// an ORS key, asked only for pairs of places not asked before and kept on the device;
// without a key, great-circle (as on the backend), and the result says which. When ORS
// does not answer, no job is created (502): never a silent switch to great-circle.
//
// Road lines for the map: asked from ORS only when the map shows a route, then kept on
// the device by profile and stops (the last KEPT_ROUTE_LINES lines), so a route is never
// asked twice; without a key there is no line (null) and the map draws straight lines.
//
// Data file (deviceFile.ts): all of the above can be exported as one file without the ORS
// key, and a checked file replaces everything on the device; the device keeps its own key.

export interface LocalApiOptions {
  /** the starting data, used only when the store is empty: a fixture scenario, or EMPTY_START */
  scenario: Pick<Scenario, 'shipments' | 'locations' | 'trucks' | 'base'>
  runSolver: SolverRunner
  store: DeviceStore<LocalData>
  readWorkbook?: WorkbookReader
  /** how Nominatim is reached; tests give a fake fetch and no pause between requests */
  nominatim?: { fetch: typeof fetch; minIntervalMs?: number }
  /** how OpenRouteService is reached; the same for tests */
  ors?: { fetch: typeof fetch; minIntervalMs?: number }
}

/** A device without data: shipments come from an Excel import, trucks are made by the jobs (B1). */
export const EMPTY_START: LocalApiOptions['scenario'] = {
  shipments: [],
  locations: [],
  trucks: [],
  // Not used by open routes (A2); the API still answers it.
  base: { baseLocationId: 0, returnToBase: false },
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  geocodingEnabled: true,
  contactEmail: null,
  orsApiKey: null,
  orsProfile: 'driving-hgv',
  extraTruckSavingPercent: 10,
}

/** Id of the truck added for the extra-truck comparison; never stored. */
const EXTRA_TRUCK_ID = -1

const PROFILE_LABELS: Record<OrsProfile, string> = { 'driving-hgv': 'za teretna vozila', 'driving-car': 'za automobile' }

/** Jobs kept on the device; older finished jobs are dropped (the screens show only the last one). */
export const KEPT_JOBS = 10
/** Road lines kept on the device, the oldest dropped first: about the routes of the kept jobs. */
export const KEPT_ROUTE_LINES = 50

export interface LocalJob {
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
  /** ORS road lines by `lineKey` (profile and the stops in order), oldest first */
  routeLineCache?: Record<string, RouteLine['path']>
}

/** Coordinates written to 6 decimals (about 10 cm), so a moved place is a new pair. */
const pointKey = (p: LatLon) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`

function roadKey(profile: OrsProfile, from: LatLon, to: LatLon): string {
  return `${profile}|${pointKey(from)}|${pointKey(to)}`
}

const lineKey = (profile: OrsProfile, stops: LatLon[]) => `${profile}|${stops.map(pointKey).join(';')}`

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
  let routeLineCache: Record<string, RouteLine['path']> = {}
  const roadDistances = createOrsDistances(ors)
  const roadLines = createOrsLines(ors)
  // A line being asked for, by `lineKey`: a second request for it waits for the same answer.
  const askingLines = new Map<string, Promise<RouteLine['path']>>()
  const geocoder = createNominatimGeocoder({
    fetch: nominatim.fetch,
    minIntervalMs: nominatim.minIntervalMs,
    contactEmail: () => settings.contactEmail,
  })

  const locate: PlaceLocator = async (place, locateOptions) => {
    if (!settings.geocodingEnabled) {
      return { kind: 'failed', message: 'Traženje koordinata je isključeno u podešavanjima.' }
    }
    const key = placeKey(place)
    let answer = geocodeCache[key]
    if (!answer || (!answer.found && locateOptions?.again)) {
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
  const imports = createImportStore({
    shipments,
    locations,
    readWorkbook,
    locate,
    placeWarning,
    // Kept jobs name their shipments by id, also after "Ukloni sve pošiljke".
    firstFreeShipmentId: () => Math.max(0, ...[...jobs.values()].flatMap((j) => j.input.shipments.map((s) => s.id))) + 1,
  })
  const editor = createShipmentEditor({
    shipments,
    locations,
    locate,
    assertCanChange: () => assertNoActiveJob('pošiljke se mogu menjati'),
    keepsPlace: (id) => keptPlaces().has(id),
  })
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
      // A scenario's trucks are at its base (probni podaci), so a job can start at once.
      trucks: structuredClone(scenario.trucks).map((t) => ({
        ...t,
        startLocationId: scenario.locations.some((l) => l.id === scenario.base.baseLocationId && l.lat !== null)
          ? scenario.base.baseLocationId
          : null,
        startSetAfterJobId: null,
      })),
      jobs: [],
      nextTruckId: Math.max(0, ...scenario.trucks.map((t) => t.id)) + 1,
      nextJobId: 1,
    }
    const interrupted = apply(data)
    if (!stored || interrupted) await persist()
  }

  /** Takes over stored (or imported) data; true when a job had to be marked FAILED. */
  function apply(data: LocalData): boolean {
    // The arrays stay the same objects, since the import store writes into them.
    shipments.splice(0, shipments.length, ...data.shipments)
    locations.splice(0, locations.length, ...data.locations)
    trucks.splice(0, trucks.length, ...data.trucks)
    nextTruckId = data.nextTruckId
    nextJobId = data.nextJobId
    settings = { ...DEFAULT_SETTINGS, ...data.settings }
    geocodeCache = data.geocodeCache ?? {}
    distanceCache = data.distanceCache ?? {}
    routeLineCache = data.routeLineCache ?? {}
    jobs.clear()
    let interrupted = false
    for (const job of data.jobs) {
      // The page was closed (or the file was exported) while the job waited or ran; its solver is gone.
      if (!TERMINAL_JOB_STATUSES.includes(job.status)) {
        job.status = 'FAILED'
        job.finishedAt = new Date().toISOString()
        interrupted = true
      }
      jobs.set(job.id, job)
    }
    return interrupted
  }

  function snapshot(): Required<LocalData> {
    return {
      shipments,
      locations,
      trucks,
      jobs: [...jobs.values()],
      nextTruckId,
      nextJobId,
      settings,
      geocodeCache,
      distanceCache,
      routeLineCache,
    }
  }

  function persist(): Promise<void> {
    const write = saving.then(() => store.save(snapshot()))
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

  /** 409 while a job waits or runs; `allowed` says what can be done once it ends. */
  function assertNoActiveJob(allowed: string): void {
    const running = activeJob()
    if (running) {
      throw new ApiError({
        title: 'Optimizacija je u toku',
        status: 409,
        detail: `Optimizacija #${running.id} je u toku; ${allowed} kada se završi.`,
      })
    }
  }

  /**
   * Places that stay without shipments: the base, where the trucks are, and the places of
   * kept jobs, so an earlier result still names its stops.
   */
  function keptPlaces(): Set<number> {
    return new Set([
      scenario.base.baseLocationId,
      ...trucks.flatMap((t) => (t.startLocationId == null ? [] : [t.startLocationId])),
      ...[...jobs.values()].flatMap((j) => j.input.locationIds),
    ])
  }

  /** Where a truck is, when that place has coordinates. */
  function startOfTruck(truck: Truck): Location | null {
    const location = locations.find((l) => l.id === truck.startLocationId)
    return location && location.lat !== null && location.lon !== null ? location : null
  }

  /** The newest job the device has, so a proposal from it is not offered again. */
  function newestJobId(): number | null {
    return jobs.size > 0 ? Math.max(...jobs.keys()) : null
  }

  /** The truck's last delivery in the newest completed job after its location was set. */
  function proposalFor(truck: Truck): TruckStart['proposal'] {
    const since = truck.startSetAfterJobId ?? 0
    const newer = [...jobs.values()].filter((j) => j.id > since && j.status === 'COMPLETED' && j.result).sort((a, b) => b.id - a.id)
    for (const job of newer) {
      const route = job.result?.routes.find((r) => r.truckId === truck.id)
      const last = route?.stops.at(-1)
      if (!last) continue
      const location = locations.find((l) => l.id === last.locationId)
      if (!location || location.id === truck.startLocationId) return null
      return { location, jobId: job.id, finishedAt: job.finishedAt }
    }
    return null
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
    const freeTrucks = request.freeTrucks ?? 0
    if (!Number.isInteger(freeTrucks) || freeTrucks < 0) throw badRequest({ freeTrucks: 'Broj kamiona mora biti ceo broj, 0 ili veći.' })
    requireCoordinates(chosenShipments, usedLocations(chosenShipments))

    // Unavailable trucks are not sent to the solver; every other one starts where it is.
    const own = chosenTrucks.filter((t) => t.available)
    const startless = own.filter((t) => !startOfTruck(t))
    if (startless.length > 0) {
      throw new ApiError({
        title: 'Lokacije kamiona',
        status: 409,
        detail:
          `Kamioni bez potvrđene lokacije (${startless.length}): ${startless.map((t) => t.name).join(', ')}. ` +
          'Unesite ili potvrdite gde se nalaze pre pokretanja optimizacije.',
      })
    }
    const jobTrucks: JobTruck[] = own.map((t) => ({ ...toJobTruck(t), startLocationId: t.startLocationId }))
    // Planning without some shipments needs at least one truck; otherwise nothing may be proven.
    const findings = request.allowUnassigned && own.length > 0 ? [] : provenFindings(chosenShipments, jobTrucks)
    if (findings.length > 0) {
      const missing = findings.some((f) => f.about === 'fleet') ? missingTrucks(chosenShipments, jobTrucks) : null
      throw new ApiError({
        title: 'Dokazano neizvodljivo',
        status: 422,
        detail: 'Provera pre pokretanja je dokazala da rešenje ne postoji. Solver nije pokrenut.',
        infeasibilityKind: 'PROVEN',
        causes: findings.map((f) => f.text),
        ...(missing ? { missingTrucks: missing } : {}),
      })
    }
    const startIds = new Set(own.map((t) => t.startLocationId))
    const shipmentPlaces = usedLocations(chosenShipments)
    const used = locations.filter((l) => startIds.has(l.id) || shipmentPlaces.includes(l)).sort((a, b) => a.id - b.id)
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
        allowUnassigned: request.allowUnassigned ?? false,
        freeTrucks,
      },
      fleet: new Map(own.map((t) => [t.id, structuredClone(t)])),
      addedTruckIds: new Set(),
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

  /** The road line of one route, asked from ORS once per profile and stops; null without a key. */
  async function routeLine(jobId: number, truckId: number): Promise<RouteLine | null> {
    const job = findJob(jobId)
    const result = completedResult(job)
    const route = result.routes.find((r) => r.truckId === truckId)
    if (!route) throw notFound(`Kamion ${truckId} nema rutu u poslu ${jobId}.`)
    // The same points as on the map: where the truck was, the stops, and the base around them on a route that returns.
    const base = result.openRoute ? [] : [scenario.base.baseLocationId]
    const start = route.startLocationId === undefined ? base : [route.startLocationId]
    const ids = [...start, ...route.stops.map((s) => s.locationId), ...(route.stops.length > 0 ? base : [])]
    const byId = new Map(locations.map((l) => [l.id, l]))
    const stops = ids.flatMap((id) => {
      const location = byId.get(id)
      return location && location.lat !== null && location.lon !== null ? [{ lat: location.lat, lon: location.lon }] : []
    })
    // The roads the job's distances were measured on; for great-circle jobs, the profile in the settings.
    const profile = job.distanceSource && job.distanceSource !== 'airline' ? job.distanceSource : settings.orsProfile
    const key = lineKey(profile, stops)
    const kept = routeLineCache[key]
    if (kept) return { profile, path: kept }
    const apiKey = settings.orsApiKey
    if (!apiKey) return null

    let asking = askingLines.get(key)
    if (!asking) {
      asking = (async () => {
        try {
          const path = await roadLines(stops, { apiKey, profile })
          keepLine(key, path)
          await persist()
          return path
        } catch (error) {
          if (!(error instanceof RoadDistanceError)) throw error
          throw new ApiError({ title: 'Linija po putu nije dostupna', status: 502, detail: error.message })
        } finally {
          askingLines.delete(key)
        }
      })()
      askingLines.set(key, asking)
    }
    return { profile, path: await asking }
  }

  function keepLine(key: string, path: RouteLine['path']): void {
    delete routeLineCache[key]
    routeLineCache[key] = path
    const keys = Object.keys(routeLineCache)
    for (const old of keys.slice(0, keys.length - KEPT_ROUTE_LINES)) delete routeLineCache[old]
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
      const input = toSolverInput(job.input)
      const solution = await runSolver(input, { timeLimitMs: job.timeLimitSeconds * 1000 })
      job.score = solution.score
      if (isFeasible(solution.score)) {
        const result = toOptimizationResult(
          job.input,
          solution.routes.map((r) => ({ truckId: r.truckId, route: r.route })),
        )
        const extraTruck = await adviseExtraTruck(job, input, result)
        job.result = { ...result, openRoute: true, distanceSource: job.distanceSource, ...(extraTruck ? { extraTruck } : {}) }
        job.trucksLowerBound = result.trucksLowerBound
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

  /**
   * The same shipments solved again, as long, on exactly one truck more than the result uses,
   * with one standard truck added (counted as if it started at its first pickup, since it is
   * not anywhere yet). Advised only when that saves at least the share in the settings.
   */
  async function adviseExtraTruck(job: LocalJob, input: SolverInput, result: OptimizationResult) {
    const percent = settings.extraTruckSavingPercent
    if (percent === null || result.unassignedShipmentIds.length > 0 || result.totalMeters === 0) return undefined
    const extra = standardJobTruck(EXTRA_TRUCK_ID)
    const other = await runSolver(
      {
        ...input,
        trucks: [...input.trucks, { id: extra.id, capacityLdmTenths: extra.capacityLdmTenths, capacityKg: extra.capacityKg, start: null }],
        allowUnassigned: false,
        freeTrucks: undefined,
        exactTrucks: result.trucksUsed + 1,
      },
      { timeLimitMs: job.timeLimitSeconds * 1000 },
    )
    const meters = -other.score.soft
    const saving = ((result.totalMeters - meters) / result.totalMeters) * 100
    if (!isFeasible(other.score) || other.routes.length <= result.trucksUsed || saving < percent) return undefined
    return {
      trucksUsed: other.routes.length,
      totalMeters: meters,
      savingPercent: Math.floor(saving),
      newTruck: other.routes.some((r) => r.truckId === EXTRA_TRUCK_ID),
    }
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
        // Where it is comes with setTruckStart (looked up, or confirmed by the user).
        const created: Truck = { ...input, id: nextTruckId++, startLocationId: null, startSetAfterJobId: null }
        trucks.push(created)
        return created
      }),

    updateTruck: (id, input) =>
      change(() => {
        const index = trucks.findIndex((t) => t.id === id)
        if (index < 0) throw notFound(`Kamion ${id} ne postoji.`)
        assertValidTruck(input)
        const { startLocationId = null, startSetAfterJobId = null } = trucks[index]
        trucks[index] = { ...input, id, startLocationId, startSetAfterJobId }
        return trucks[index]
      }),

    getTruckStarts: () =>
      respond(() => trucks.map((t): TruckStart => ({ truckId: t.id, location: startOfTruck(t), proposal: proposalFor(t) }))),

    setTruckStart: (id, input) =>
      change(async (): Promise<TruckStartResult> => {
        const truck = trucks.find((t) => t.id === id)
        if (!truck) throw notFound(`Kamion ${id} ne postoji.`)
        if ('proposalJobId' in input) {
          assertNoActiveJob('lokacija kamiona se može menjati')
          const proposal = proposalFor(truck)
          if (!proposal || proposal.jobId !== input.proposalJobId) {
            throw new ApiError({ title: 'Predlog više ne važi', status: 409, detail: `Za kamion „${truck.name}“ nema tog predloga lokacije.` })
          }
          Object.assign(truck, { startLocationId: proposal.location.id, startSetAfterJobId: newestJobId() })
          return { truck, outcome: 'known' as const, name: proposal.location.name, message: null }
        }
        if ('keep' in input) {
          assertNoActiveJob('lokacija kamiona se može menjati')
          const kept = startOfTruck(truck)
          if (!kept) throw new ApiError({ title: 'Nema lokacije', status: 409, detail: `Kamion „${truck.name}“ još nema lokaciju koju bi zadržao.` })
          truck.startSetAfterJobId = newestJobId()
          return { truck, outcome: 'known' as const, name: kept.name, message: null }
        }
        assertNoActiveJob('lokacija kamiona se može menjati')
        const located = await editor.locatePlace(input.place)
        // A job may have started, or the truck been removed, while the place was looked up.
        assertNoActiveJob('lokacija kamiona se može menjati')
        const current = trucks.find((t) => t.id === id)
        if (!current) throw notFound(`Kamion ${id} ne postoji.`)
        if (located.location) Object.assign(current, { startLocationId: located.location.id, startSetAfterJobId: newestJobId() })
        return { truck: current, outcome: located.outcome, name: located.name, message: located.message }
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

    getRouteLine: (jobId, truckId) => respond(() => routeLine(jobId, truckId)),

    createImport: (file) => respond(() => imports.create(file)),
    setImportMapping: (importId, mapping) => respond(() => imports.setMapping(importId, mapping)),
    getImportPreview: (importId) => respond(() => imports.preview(importId)),
    updateImportRow: (importId, rowNumber, patch) => respond(() => imports.updateRow(importId, rowNumber, patch)),
    commitImport: (importId, commitOptions) => change(() => imports.commit(importId, commitOptions?.onProgress)),

    deleteAllShipments: () =>
      change(() => {
        assertNoActiveJob('pošiljke se mogu ukloniti')
        const removed = shipments.length
        shipments.splice(0)
        const kept = keptPlaces()
        const before = locations.length
        locations.splice(0, locations.length, ...locations.filter((l) => kept.has(l.id)))
        return { shipments: removed, locations: before - locations.length }
      }),

    updateShipment: (id, patch) => change(() => editor.update(id, patch)),

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
        const percent = input.extraTruckSavingPercent
        if (percent !== null && !(Number.isInteger(percent) && percent >= 1 && percent <= 99)) {
          errors.extraTruckSavingPercent = 'Unesite ceo broj od 1 do 99 ili ostavite prazno.'
        }
        if (Object.keys(errors).length > 0) throw badRequest(errors)
        settings = {
          geocodingEnabled: input.geocodingEnabled,
          contactEmail,
          orsApiKey,
          orsProfile: input.orsProfile,
          extraTruckSavingPercent: percent,
        }
        return settings
      }),

    exportDeviceData: () =>
      respond(() => {
        const now = new Date()
        return { fileName: deviceFileName(now), content: writeDeviceFile(snapshot(), now) }
      }),

    checkDeviceData: (content) => respond(() => readFile(content).summary),

    replaceDeviceData: (content) =>
      change(() => {
        const { data, summary } = readFile(content)
        const running = activeJob()
        if (running) {
          throw new ApiError({
            title: 'Optimizacija je u toku',
            status: 409,
            detail: `Optimizacija #${running.id} je u toku; podaci se mogu uvesti kada se završi.`,
          })
        }
        // The key is never in a file: the device keeps its own.
        apply({ ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings, orsApiKey: settings.orsApiKey } })
        return summary
      }),
  }
}

/** A data file, or 400 with the reason; reading it changes nothing. */
function readFile(content: string) {
  try {
    return readDeviceFile(content)
  } catch (error) {
    if (!(error instanceof DeviceFileError)) throw error
    throw new ApiError({ title: 'Neispravan fajl', status: 400, detail: error.message })
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
