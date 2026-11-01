import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { createMemoryStore, DeviceStoreError, type DeviceStore } from '../../src/api/local/deviceStore'
import { createLocalApiClient, DEFAULT_SETTINGS, KEPT_JOBS, KEPT_ROUTE_LINES, type LocalData } from '../../src/api/local/localClient'
import { TERMINAL_JOB_STATUSES, type OptimizationJob, type OrsProfile, type RouteStop } from '../../src/api/types'
import type { SolverRunner } from '../../src/domain/optimization/solverRunner'
import { runInThread } from '../../src/domain/optimization/solverRunner'
import { SCENARIOS, type Scenario, type ScenarioName } from '../../src/fixtures'

const REQUEST = { timeLimitSeconds: 60, truckIds: null, shipmentIds: null }

/** The real solver on this thread, with a step limit instead of the job's time limit. */
const steps: SolverRunner = (input) => runInThread(input, { seed: 1, stepLimit: 3000 })

// Invented workbook: one row whose places the mock gazetteer knows.
const SHEET = [
  ['RELACIJA', 'TEŽINA', 'DIMENZIJE'],
  ['BEOGRAD 34131 - LJUNGBY', '1,200 kg', '2,4m'],
]

function setup(
  scenario: ScenarioName | Scenario,
  runSolver: SolverRunner = steps,
  store: DeviceStore<LocalData> = createMemoryStore<LocalData>(),
): ApiClient {
  return createLocalApiClient({
    scenario: typeof scenario === 'string' ? SCENARIOS[scenario] : scenario,
    runSolver,
    store,
    readWorkbook: async () => [{ sheet: 'Sheet1', data: SHEET }],
  })
}

/** The last write of a job is not waited for by anybody; let it finish. */
const written = () => new Promise((resolve) => setTimeout(resolve, 0))

const storedData = (store: { snapshot(): unknown }) => (store.snapshot() as { data: LocalData }).data

async function settle(api: ApiClient, id: number): Promise<OptimizationJob> {
  for (let i = 0; i < 100; i++) {
    const job = await api.getOptimizationJob(id)
    if (TERMINAL_JOB_STATUSES.includes(job.status)) return job
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('job did not finish')
}

/** Loaded from the rear, checked here without the validator: earlier loaded is never earlier unloaded (by place). */
function rearLoaded(stops: RouteStop[]): boolean {
  const place = new Map<string, number>()
  let n = 0
  stops.forEach((stop, i) => {
    const before = stops[i - 1]
    if (before && (before.type !== stop.type || before.locationId !== stop.locationId)) n++
    place.set(`${stop.type}${stop.shipmentId}`, n)
  })
  const ids = stops.filter((s) => s.type === 'PICKUP').map((s) => s.shipmentId)
  const at = (type: string, id: number) => place.get(`${type}${id}`) as number
  return ids.every((a) => ids.every((b) => !(at('PICKUP', a) < at('PICKUP', b) && at('DELIVERY', a) < at('DELIVERY', b))))
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('local optimization', () => {
  it('solves the small scenario with open routes and a passing validator', async () => {
    const api = setup('small')
    const { id, status } = await api.createOptimizationJob(REQUEST)
    expect(status).toBe('QUEUED')
    const job = await settle(api, id)
    expect(job.status).toBe('COMPLETED')
    expect(job.scoreHard).toBe(0)

    const result = await api.getOptimizationResult(id)
    expect(result.validation).toEqual({ passed: true, violations: [] })
    expect(result.openRoute).toBe(true)
    expect(result.unassignedShipmentIds).toEqual([])
    // 20,9 LDM: two trucks of 13,6 LDM.
    expect(result.trucksUsed).toBe(2)
    expect(result.trucksLowerBound).toBe(2)
    expect(job.scoreMedium).toBe(-2)
    expect(job.scoreSoft).toBe(-result.totalMeters)
    for (const route of result.routes) {
      expect(route.stops[0].legMeters).toBe(0)
      const deliveries = route.stops.filter((s) => s.type === 'DELIVERY').map((s) => s.shipmentId)
      const pickups = route.stops.filter((s) => s.type === 'PICKUP').map((s) => s.shipmentId)
      expect(new Set(deliveries)).toEqual(new Set(pickups))
      expect(rearLoaded(route.stops)).toBe(true)
    }
  })

  it('adds the standard trucks a result uses to the trucks list', async () => {
    // 3 x 7,0 LDM need three trucks; the scenario has two.
    const api = setup('notFound')
    const { id } = await api.createOptimizationJob(REQUEST)
    expect((await settle(api, id)).status).toBe('COMPLETED')
    const result = await api.getOptimizationResult(id)
    expect(result.trucksUsed).toBe(3)

    const trucks = await api.listTrucks()
    expect(trucks.map((t) => t.name)).toEqual(['Šleper 1', 'Šleper 2', 'Kamion 1'])
    expect(result.routes.map((r) => r.truckId).sort()).toEqual(trucks.map((t) => t.id).sort())
    expect(trucks[2]).toMatchObject({ capacityLdmTenths: 136, available: true, innerLengthMm: 13_600 })

    // The next job continues the numbering.
    const second = await api.createOptimizationJob({ ...REQUEST, truckIds: [] })
    expect((await settle(api, second.id)).status).toBe('COMPLETED')
    expect((await api.listTrucks()).map((t) => t.name).slice(3)).toEqual(['Kamion 2', 'Kamion 3', 'Kamion 4'])
  })

  it('does not give the solver unavailable trucks', async () => {
    const given: number[][] = []
    const spy: SolverRunner = (input, options) => {
      given.push(input.trucks.map((t) => t.id))
      return steps(input, options)
    }
    const api = setup('small', spy)
    await settle(api, (await api.createOptimizationJob(REQUEST)).id)
    // Šleper 1 and 2, then one standard truck per shipment; Solo 1 (id 3) is unavailable.
    expect(given[0].slice(0, 2)).toEqual([1, 2])
    expect(given[0]).toHaveLength(2 + 5)
    expect(given[0]).not.toContain(3)
  })

  it('answers 422 PROVEN before solving', async () => {
    const runSolver = vi.fn(steps)
    const error = await rejection(setup('proven', runSolver).createOptimizationJob(REQUEST))
    expect(error.status).toBe(422)
    expect(error.problem.infeasibilityKind).toBe('PROVEN')
    expect(error.problem.causes).toEqual(['Pošiljka S-401 (14,0 LDM) je veća od najvećeg kamiona (13,6 LDM).'])
    expect(runSolver).not.toHaveBeenCalled()
  })

  it('gives the solver each truck payload, and proves a shipment too heavy for every truck', async () => {
    const small = SCENARIOS.small
    const heavy: Scenario = {
      ...small,
      trucks: small.trucks.map((t) => ({ ...t, capacityKg: t.id === 1 ? 5000 : null })),
    }
    const given: number[][] = []
    const spy: SolverRunner = (input, options) => {
      given.push(input.trucks.map((t) => t.capacityKg))
      return steps(input, options)
    }
    const api = setup(heavy, spy)
    await settle(api, (await api.createOptimizationJob(REQUEST)).id)
    // Šleper 1 carries at most 5 t, Šleper 2 has no payload, the standard trucks 24 t.
    expect(given[0]).toEqual([5000, Infinity, 24_000, 24_000, 24_000, 24_000, 24_000])

    const tooHeavy: Scenario = {
      ...heavy,
      trucks: heavy.trucks.map((t) => ({ ...t, capacityKg: 20_000 })),
      shipments: small.shipments.map((s) => (s.id === 101 ? { ...s, weightKg: 30_000 } : s)),
    }
    const error = await rejection(setup(tooHeavy).createOptimizationJob(REQUEST))
    expect(error.problem.causes).toEqual(['Pošiljka S-101 (30000 kg) je teža od najveće nosivosti kamiona (24000 kg).'])

    // Alone and without own trucks it gets one standard truck; the total over it is not a second reason.
    const alone: Scenario = { ...tooHeavy, trucks: [], shipments: tooHeavy.shipments.filter((s) => s.id === 101) }
    const single = await rejection(setup(alone).createOptimizationJob(REQUEST))
    expect(single.problem.causes).toEqual(['Pošiljka S-101 (30000 kg) je teža od najveće nosivosti kamiona (24000 kg).'])
  })

  it('answers 409 for shipments without coordinates', async () => {
    const error = await rejection(setup('test7').createOptimizationJob(REQUEST))
    expect(error.status).toBe(409)
    expect(error.problem.detail).toMatch(/^Pošiljke sa nejasnom lokacijom \(4\): S1, S2, S3, S4\./)
  })

  it('answers 400 for a bad time limit and unknown ids', async () => {
    const api = setup('small')
    expect((await rejection(api.createOptimizationJob({ ...REQUEST, timeLimitSeconds: 0 }))).problem.errors).toEqual({
      timeLimitSeconds: 'Vremensko ograničenje mora biti veće od 0.',
    })
    expect((await rejection(api.createOptimizationJob({ ...REQUEST, truckIds: [99] }))).problem.errors).toEqual({
      truckIds: 'Kamion ne postoji: 99.',
    })
    expect((await rejection(api.createOptimizationJob({ ...REQUEST, shipmentIds: [] }))).problem.detail).toBe(
      'Nema pošiljki za optimizaciju.',
    )
  })

  it('reports NOT_FOUND when the solver ends over capacity, and FAILED when it throws', async () => {
    const overCapacity: SolverRunner = async (input) => ({
      ...(await steps(input, {})),
      score: { hard: -1, medium: -1, soft: -1 },
    })
    const api = setup('small', overCapacity)
    const { id } = await api.createOptimizationJob(REQUEST)
    const job = await settle(api, id)
    expect([job.status, job.infeasibilityKind, job.feasible]).toEqual(['INFEASIBLE', 'NOT_FOUND', false])
    expect((await rejection(api.getOptimizationResult(id))).status).toBe(409)

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = setup('small', () => Promise.reject(new Error('boom')))
    const failed = await broken.createOptimizationJob(REQUEST)
    expect((await settle(broken, failed.id)).status).toBe('FAILED')
    error.mockRestore()
  })

  it('passes the time limit to the solver and runs jobs one at a time', async () => {
    let release = () => {}
    const calls: number[] = []
    const held: SolverRunner = (input, options) => {
      calls.push(options.timeLimitMs ?? 0)
      return new Promise((resolve) => (release = () => resolve(steps(input, {}))))
    }
    const api = setup('small', held)
    const first = await api.createOptimizationJob({ ...REQUEST, timeLimitSeconds: 5 })
    const second = await api.createOptimizationJob({ ...REQUEST, timeLimitSeconds: 7 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await api.getOptimizationJob(first.id)).status).toBe('RUNNING')
    expect((await api.getOptimizationJob(second.id)).status).toBe('QUEUED')
    expect(calls).toEqual([5000])

    // A truck cannot be removed while a job waits or runs.
    expect((await rejection(api.deleteTruck(1))).status).toBe(409)

    release()
    expect((await settle(api, first.id)).status).toBe('COMPLETED')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual([5000, 7000])
    release()
    expect((await settle(api, second.id)).status).toBe('COMPLETED')
    await api.deleteTruck(1)
  })

  it('builds the 3D plan with what is unloaded first at the doors', async () => {
    const api = setup('small')
    const { id } = await api.createOptimizationJob(REQUEST)
    await settle(api, id)
    const result = await api.getOptimizationResult(id)
    for (const route of result.routes) {
      const plan = await api.getLoadPlan(id, route.truckId)
      const firstUnloaded = route.stops.find((s) => s.type === 'DELIVERY')!.shipmentId
      const atDoors = plan.placements.reduce((a, b) => (b.xMm > a.xMm ? b : a))
      expect(plan.placements).toHaveLength(route.stops.length / 2)
      expect(atDoors.shipmentId).toBe(firstUnloaded)
    }
    expect((await rejection(api.getLoadPlan(id, 3))).status).toBe(404)
  })
})

describe('local storage on the device', () => {
  const TRUCK = {
    name: 'Cerada 7',
    capacityLdmTenths: 136,
    capacityKg: 24_000,
    available: true,
    innerLengthMm: 13_600,
    innerWidthMm: 2480,
    innerHeightMm: 2700,
  }

  it('starts from the scenario once and stores it at once', async () => {
    const store = createMemoryStore<LocalData>()
    await setup('small', steps, store).listTrucks()
    expect(store.snapshot()).toMatchObject({ version: 1, data: { trucks: SCENARIOS.small.trucks, jobs: [] } })

    // The stored data wins over the scenario from then on.
    expect(await setup('notFound', steps, store).listShipments()).toEqual(SCENARIOS.small.shipments)
  })

  it('keeps truck changes and the next ids across a restart', async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup('small', steps, store)
    const created = await api.createTruck(TRUCK)
    await api.updateTruck(1, { ...TRUCK, name: 'Šleper A' })
    await api.deleteTruck(2)

    const after = setup('small', steps, store)
    expect((await after.listTrucks()).map((t) => t.name)).toEqual(['Šleper A', 'Solo 1', 'Cerada 7'])
    expect((await after.createTruck(TRUCK)).id).toBe(created.id + 1)
  })

  it('keeps a finished job with its result, 3D plan and added trucks', async () => {
    const store = createMemoryStore<LocalData>()
    // The solver answers later, as the Web Worker does, so the job is stored while running first.
    const later: SolverRunner = async (input, options) => {
      await written()
      return steps(input, options)
    }
    const api = setup('notFound', later, store)
    expect(await api.getLatestOptimizationJob()).toBeNull()
    const { id } = await api.createOptimizationJob(REQUEST)
    const job = await settle(api, id)
    const result = await api.getOptimizationResult(id)
    await written()

    const after = setup('notFound', steps, store)
    expect(await after.getLatestOptimizationJob()).toEqual(job)
    expect(await after.getOptimizationResult(id)).toEqual(result)
    const truckId = result.routes[0].truckId
    expect(await after.getLoadPlan(id, truckId)).toEqual(await api.getLoadPlan(id, truckId))
    expect((await after.listTrucks()).map((t) => t.name)).toEqual(['Šleper 1', 'Šleper 2', 'Kamion 1'])
    expect((await after.createOptimizationJob(REQUEST)).id).toBe(id + 1)
  })

  it('marks a job that waited or ran when the page closed as FAILED, and stores that', async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup('small', () => new Promise(() => {}), store)
    const running = await api.createOptimizationJob(REQUEST)
    const queued = await api.createOptimizationJob(REQUEST)
    await written()
    expect((await api.getOptimizationJob(running.id)).status).toBe('RUNNING')
    expect(storedData(store).jobs.map((j) => j.status)).toEqual(['RUNNING', 'QUEUED'])

    const after = setup('small', steps, store)
    for (const id of [running.id, queued.id]) {
      const job = await after.getOptimizationJob(id)
      expect(job.status).toBe('FAILED')
      expect(job.finishedAt).not.toBeNull()
    }
    expect(storedData(store).jobs.map((j) => j.status)).toEqual(['FAILED', 'FAILED'])
    // Nothing waits or runs any more, so a truck can be removed.
    await after.deleteTruck(1)
  })

  it(`keeps only the last ${KEPT_JOBS} jobs`, async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup('small', steps, store)
    let last = 0
    for (let i = 0; i < KEPT_JOBS + 2; i++) {
      last = (await api.createOptimizationJob(REQUEST)).id
      await settle(api, last)
    }
    expect((await rejection(api.getOptimizationJob(1))).status).toBe(404)
    expect((await rejection(api.getOptimizationJob(2))).status).toBe(404)
    expect((await api.getOptimizationJob(3)).status).toBe('COMPLETED')
    expect((await api.getLatestOptimizationJob())?.id).toBe(last)
    await written()
    expect(storedData(store).jobs).toHaveLength(KEPT_JOBS)
  })

  it('keeps committed import rows and their new places', async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup('small', steps, store)
    const { importId } = await api.createImport(new File(['fake'], 'Relacije.xlsx'))
    await api.setImportMapping(importId, { sheetName: 'Sheet1', headerRow: 1, columns: { relation: 0, weight: 1, ldm: 2 } })
    await api.commitImport(importId)
    const shipments = await api.listShipments()
    expect(shipments).toHaveLength(SCENARIOS.small.shipments.length + 1)

    const after = setup('small', steps, store)
    expect(await after.listShipments()).toEqual(shipments)
    expect(await after.listLocations()).toEqual(await api.listLocations())
  })

  it('answers every call with a clear error when the stored data cannot be used, and keeps it', async () => {
    const stored = { version: 99, data: {} }
    const store = createMemoryStore<LocalData>(stored)
    const api = setup('small', steps, store)
    expect((await rejection(api.listTrucks())).problem).toEqual({
      title: 'Podaci na uređaju',
      status: 500,
      detail: 'Podaci na uređaju su u formatu 99, a aplikacija zna samo format 1.',
    })
    expect((await rejection(api.createTruck(TRUCK))).status).toBe(500)
    expect(store.snapshot()).toEqual(stored)
  })

  it('answers a change only once it is stored', async () => {
    const failing: DeviceStore<LocalData> = {
      load: async () => null,
      save: () => Promise.reject(new DeviceStoreError('Čuvanje na uređaju nije uspelo (upis): disk je pun.')),
    }
    const error = await rejection(setup('small', steps, failing).createTruck(TRUCK))
    expect(error.problem.detail).toBe('Čuvanje na uređaju nije uspelo (upis): disk je pun.')
  })
})

describe('coordinates from Nominatim on the device', () => {
  // Invented places; the fake Nominatim knows Primerovo and Teststad.
  const COORDINATES: Record<string, { lat: string; lon: string }> = {
    Primerovo: { lat: '45.1', lon: '20.1' },
    Teststad: { lat: '57.1', lon: '12.1' },
  }
  const ROWS = [
    ['RELACIJA', 'TEŽINA', 'DIMENZIJE'],
    ['PRIMEROVO - TESTSTAD 11111', '1,200 kg', '2,4m'],
    ['PRIMEROVO - DRUGSTAD 22222', '800 kg', '1,2m'],
  ]
  const MAPPING = { sheetName: 'Sheet1', headerRow: 1, columns: { relation: 0, weight: 1, ldm: 2 } }

  type Answer = 'ok' | 'down'
  function nominatim(answer: () => Answer = () => 'ok') {
    const asked: URL[] = []
    const fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      asked.push(url)
      if (answer() === 'down') throw new TypeError('Failed to fetch')
      const place = COORDINATES[url.searchParams.get('q') ?? '']
      return new Response(JSON.stringify(place ? [{ ...place, display_name: url.searchParams.get('q') }] : []))
    }) as typeof globalThis.fetch
    return { fetch, asked, names: () => asked.map((u) => u.searchParams.get('q')) }
  }

  function client(store: DeviceStore<LocalData>, fake: ReturnType<typeof nominatim>, rows = ROWS): ApiClient {
    return createLocalApiClient({
      scenario: SCENARIOS.small,
      runSolver: steps,
      store,
      readWorkbook: async () => [{ sheet: 'Sheet1', data: rows }],
      nominatim: { fetch: fake.fetch, minIntervalMs: 0 },
    })
  }

  // Shipment ids come from the file name, so every import gets its own name (no duplicates).
  let files = 0
  async function importRows(api: ApiClient, onProgress?: (p: { done: number; total: number }) => void) {
    const { importId } = await api.createImport(new File(['fake'], `Relacije-${++files}.xlsx`))
    await api.setImportMapping(importId, MAPPING)
    return api.commitImport(importId, { onProgress })
  }

  const place = async (api: ApiClient, name: string) => (await api.listLocations()).find((l) => l.name === name)

  it('asks once per new place while committing, and writes the coordinates', async () => {
    const fake = nominatim()
    const api = client(createMemoryStore<LocalData>(), fake)
    const progress: string[] = []
    const result = await importRows(api, (p) => progress.push(`${p.done}/${p.total}`))

    expect(fake.names()).toEqual(['Primerovo', 'Teststad', 'Drugstad'])
    expect(progress).toEqual(['0/3', '1/3', '2/3', '3/3'])
    expect(result).toEqual({ created: 2, skipped: 0, geocoding: { found: 2, notFound: 1, failed: 0, message: null } })
    expect(await place(api, 'Teststad')).toMatchObject({ lat: 57.1, lon: 12.1, geocodeStatus: 'OK', postalCode: '11111' })
    expect(await place(api, 'Drugstad')).toMatchObject({ lat: null, lon: null, geocodeStatus: 'FAILED' })
  })

  it('never asks the same place again, also "not found" and after a restart', async () => {
    const store = createMemoryStore<LocalData>()
    const first = nominatim()
    await importRows(client(store, first))
    expect(first.asked).toHaveLength(3)

    // New places (Teststad without a postal code is another place) and Drugstad, which has
    // no coordinates, are looked up again, but only in what is kept: "found" and "not found".
    const second = nominatim()
    const rows = [ROWS[0], ['DRUGSTAD - PRIMEROVO', '1 kg', '1m'], ['DRUGSTAD - TESTSTAD', '1 kg', '1m']]
    const api = client(store, second, rows)
    // The preview warns only about what Nominatim did not find before, and asks nothing.
    const { importId } = await api.createImport(new File(['fake'], 'Pregled.xlsx'))
    await api.setImportMapping(importId, MAPPING)
    const preview = await api.getImportPreview(importId)
    const drugstad = 'Nominatim ranije nije pronašao „Drugstad“; pošiljka će imati status „Nejasna lokacija“.'
    expect(preview.rows.map((r) => r.warnings)).toEqual([[drugstad], [drugstad]])
    const result = await importRows(api)
    expect(second.asked).toEqual([])
    expect(result.geocoding).toEqual({ found: 1, notFound: 1, failed: 0, message: null })
    expect(Object.keys(storedData(store).geocodeCache ?? {}).sort()).toEqual(['drugstad|', 'primerovo|', 'teststad|'])
  })

  it('stops asking when Nominatim does not answer, keeps nothing, and asks again on the next import', async () => {
    const store = createMemoryStore<LocalData>()
    let answer: Answer = 'down'
    const fake = nominatim(() => answer)
    const api = client(store, fake)
    const result = await importRows(api)
    expect(fake.asked).toHaveLength(1)
    expect(result).toMatchObject({
      created: 2,
      geocoding: {
        found: 0,
        notFound: 0,
        failed: 3,
        message: 'Nominatim nije dostupan (nema veze sa internetom ili je zahtev odbijen).',
      },
    })
    expect(await place(api, 'Primerovo')).toMatchObject({ lat: null, geocodeStatus: 'FAILED' })
    expect(storedData(store).geocodeCache).toEqual({})

    answer = 'ok'
    const next = await importRows(api)
    expect(next.geocoding).toEqual({ found: 2, notFound: 1, failed: 0, message: null })
    expect(await place(api, 'Primerovo')).toMatchObject({ lat: 45.1, lon: 20.1, geocodeStatus: 'OK' })
  })

  it('stores every answer at once, so a reload in the middle of an import does not ask again', async () => {
    const store = createMemoryStore<LocalData>()
    let calls = 0
    const hanging = {
      ...nominatim(),
      // The second request never answers, as if the page were closed while waiting.
      fetch: (async (input: RequestInfo | URL) =>
        ++calls === 1 ? nominatim().fetch(input) : new Promise<Response>(() => {})) as typeof fetch,
    }
    void importRows(client(store, hanging))
    await vi.waitFor(() => expect(storedData(store).geocodeCache).toEqual({ 'primerovo|': expect.anything() }))
    expect(calls).toBe(2)
    expect(storedData(store).shipments).toHaveLength(SCENARIOS.small.shipments.length)

    const fake = nominatim()
    await importRows(client(store, fake))
    expect(fake.names()).toEqual(['Teststad', 'Drugstad'])
  })

  it('asks nothing when switched off in the settings, and keeps the settings', async () => {
    const store = createMemoryStore<LocalData>()
    const fake = nominatim()
    const api = client(store, fake)
    expect(await api.getDeviceSettings()).toEqual({ ...DEFAULT_SETTINGS, geocodingEnabled: true, contactEmail: null })
    await api.updateDeviceSettings({ ...DEFAULT_SETTINGS, geocodingEnabled: false, contactEmail: null })

    const result = await importRows(api)
    expect(fake.asked).toEqual([])
    expect(result.geocoding).toMatchObject({ failed: 3, message: 'Traženje koordinata je isključeno u podešavanjima.' })
    expect(await client(store, fake).getDeviceSettings()).toEqual({ ...DEFAULT_SETTINGS, geocodingEnabled: false, contactEmail: null })
  })

  it('sends the contact e-mail from the settings and checks it', async () => {
    const fake = nominatim()
    const api = client(createMemoryStore<LocalData>(), fake)
    const error = await rejection(api.updateDeviceSettings({ ...DEFAULT_SETTINGS, geocodingEnabled: true, contactEmail: 'nije adresa' }))
    expect(error.problem.errors).toEqual({ contactEmail: 'Unesite ispravnu e-adresu ili ostavite polje prazno.' })
    expect(await api.updateDeviceSettings({ ...DEFAULT_SETTINGS, geocodingEnabled: true, contactEmail: ' dispecer@example.com ' })).toEqual({
      ...DEFAULT_SETTINGS,
      geocodingEnabled: true,
      contactEmail: 'dispecer@example.com',
    })
    await importRows(api)
    expect(fake.asked.map((u) => u.searchParams.get('email'))).toEqual(Array(3).fill('dispecer@example.com'))
    // An empty field means no e-mail.
    expect((await api.updateDeviceSettings({ ...DEFAULT_SETTINGS, geocodingEnabled: true, contactEmail: '  ' })).contactEmail).toBeNull()
  })

  it('loads a snapshot stored before the settings and the cache existed', async () => {
    const store = createMemoryStore<LocalData>()
    await client(store, nominatim()).listTrucks()
    const older: Partial<LocalData> = storedData(store)
    delete older.settings
    delete older.geocodeCache
    const fake = nominatim()
    const api = client(createMemoryStore<LocalData>({ version: 1, data: older }), fake)
    expect(await api.getDeviceSettings()).toEqual({ ...DEFAULT_SETTINGS, geocodingEnabled: true, contactEmail: null })
    await importRows(api)
    expect(fake.asked).toHaveLength(3)
  })
})

describe('road distances from OpenRouteService on the device', () => {
  type Point = { lat: number; lon: number }
  /** The fake road: longer than the straight line, and 777 m more going west, so A to B is not B to A. */
  const road = (from: Point, to: Point) =>
    Math.round(150_000 * Math.abs(from.lat - to.lat) + 100_000 * Math.abs(from.lon - to.lon)) + (from.lon > to.lon ? 777 : 0)

  type Answer = 'ok' | 'down' | 'noRoad'
  function ors(answer: () => Answer = () => 'ok') {
    const asked: { url: string; key: string; pairs: number }[] = []
    const lines: { url: string; waypoints: number[][] }[] = []
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/directions/')) {
        // The fake road bends 0,1 degree north halfway between every two waypoints.
        const { coordinates } = JSON.parse(String(init?.body)) as { coordinates: number[][] }
        lines.push({ url: String(input), waypoints: coordinates })
        if (!(init?.headers as Record<string, string>).Accept.includes('application/geo+json')) {
          return new Response(JSON.stringify({ error: { code: 2007, message: 'This response format is not supported' } }), { status: 406 })
        }
        if (answer() === 'down') return new Response('{}', { status: 503 })
        const road = coordinates.flatMap((to, i) => {
          const from = coordinates[i - 1]
          return from ? [[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.1], to] : [to]
        })
        return new Response(JSON.stringify({ features: [{ geometry: { type: 'LineString', coordinates: road } }] }))
      }
      const body = JSON.parse(String(init?.body)) as { locations: number[][]; sources: number[]; destinations: number[] }
      asked.push({
        url: String(input),
        key: (init?.headers as Record<string, string>).Authorization,
        pairs: body.sources.length * body.destinations.length,
      })
      if (answer() === 'down') return new Response('{}', { status: 503 })
      const point = (i: number) => ({ lon: body.locations[i][0], lat: body.locations[i][1] })
      const distances = body.sources.map((s) =>
        body.destinations.map((d) => (answer() === 'noRoad' && s !== d ? null : road(point(s), point(d)))),
      )
      return new Response(JSON.stringify({ distances }))
    }) as typeof globalThis.fetch
    return { fetch, asked, lines }
  }

  function client(store: DeviceStore<LocalData>, fake: ReturnType<typeof ors>, scenario: ScenarioName = 'small'): ApiClient {
    return createLocalApiClient({
      scenario: SCENARIOS[scenario],
      runSolver: steps,
      store,
      ors: { fetch: fake.fetch, minIntervalMs: 0 },
    })
  }

  /** Places of the scenario's shipments (all with coordinates in "small", each at its own point). */
  const placesOf = (scenario: ScenarioName) =>
    new Set(SCENARIOS[scenario].shipments.flatMap((s) => [s.pickupLocationId, s.deliveryLocationId])).size

  const withKey = (api: ApiClient, orsProfile: 'driving-hgv' | 'driving-car' = 'driving-hgv') =>
    api.updateDeviceSettings({ ...DEFAULT_SETTINGS, orsApiKey: 'test-kljuc', orsProfile })

  async function solve(api: ApiClient) {
    const { id } = await api.createOptimizationJob(REQUEST)
    expect((await settle(api, id)).status).toBe('COMPLETED')
    return api.getOptimizationResult(id)
  }

  it('uses great-circle distances without a key, asks nothing, and says so', async () => {
    const fake = ors()
    const api = client(createMemoryStore<LocalData>(), fake)
    expect(await api.getDeviceSettings()).toEqual({
      geocodingEnabled: true,
      contactEmail: null,
      orsApiKey: null,
      orsProfile: 'driving-hgv',
    })
    const result = await solve(api)
    expect(fake.asked).toEqual([])
    expect(result.distanceSource).toBe('airline')
  })

  it('solves on road distances with a key: every leg is the road from the stop before', async () => {
    const fake = ors()
    const api = client(createMemoryStore<LocalData>(), fake)
    await withKey(api)
    const result = await solve(api)

    expect(fake.asked).toHaveLength(1)
    expect(fake.asked[0]).toMatchObject({ url: 'https://api.heigit.org/openrouteservice/v2/matrix/driving-hgv', key: 'test-kljuc' })
    expect(result.distanceSource).toBe('driving-hgv')
    expect(result.validation.passed).toBe(true)
    const at = new Map((await api.listLocations()).map((l) => [l.id, l as Point]))
    for (const route of result.routes) {
      route.stops.forEach((stop, i) => {
        const before = route.stops[i - 1]
        const expected = !before || before.locationId === stop.locationId ? 0 : road(at.get(before.locationId)!, at.get(stop.locationId)!)
        expect(stop.legMeters).toBe(expected)
      })
    }
    expect(result.totalMeters).toBe(result.routes.reduce((sum, r) => sum + r.totalMeters, 0))
  })

  it('asks every pair of places only once, also after a restart, and again for another profile', async () => {
    const store = createMemoryStore<LocalData>()
    const first = ors()
    const api = client(store, first)
    await withKey(api)
    await solve(api)
    // One request for the n x n matrix; kept are the n x (n - 1) directed pairs of different places.
    const n = placesOf('small')
    expect(first.asked.map((a) => a.pairs)).toEqual([n * n])
    expect(Object.keys(storedData(store).distanceCache ?? {})).toHaveLength(n * (n - 1))

    const second = ors()
    const again = client(store, second)
    await solve(again)
    expect(second.asked).toEqual([])

    await withKey(again, 'driving-car')
    expect((await solve(again)).distanceSource).toBe('driving-car')
    expect(second.asked.map((a) => a.url)).toEqual(['https://api.heigit.org/openrouteservice/v2/matrix/driving-car'])
  })

  it('creates no job when ORS does not answer (502), keeps nothing, and works once it answers', async () => {
    const store = createMemoryStore<LocalData>()
    let answer: Answer = 'down'
    const fake = ors(() => answer)
    const api = client(store, fake)
    await withKey(api)
    const error = await rejection(api.createOptimizationJob(REQUEST))
    expect(error.problem).toMatchObject({
      title: 'Kilometraže nisu dostupne',
      status: 502,
      detail: 'OpenRouteService nije izračunao kilometraže (HTTP 503).',
    })
    expect(await api.getLatestOptimizationJob()).toBeNull()
    expect(storedData(store).distanceCache).toEqual({})

    answer = 'ok'
    expect((await solve(api)).distanceSource).toBe('driving-hgv')
  })

  it('answers 409 when ORS finds no road, and keeps that answer, also after a restart', async () => {
    const store = createMemoryStore<LocalData>()
    const fake = ors(() => 'noRoad')
    const api = client(store, fake)
    await withKey(api)
    const error = await rejection(api.createOptimizationJob(REQUEST))
    expect(error.status).toBe(409)
    const n = placesOf('small')
    expect(error.problem.detail).toMatch(
      new RegExp(`^OpenRouteService ne nalazi put za teretna vozila \\(${n * (n - 1)}\\): (.+ → .+, ){4}.+ → .+ i još ${n * (n - 1) - 5}\\. Proverite koordinate tih mesta\\.$`),
    )
    expect((await rejection(api.createOptimizationJob(REQUEST))).status).toBe(409)
    // The job was refused, but the answers were stored before that.
    expect((await rejection(client(store, fake).createOptimizationJob(REQUEST))).status).toBe(409)
    expect(fake.asked).toHaveLength(1)
  })

  it('asks nothing for a job that is proven infeasible first', async () => {
    const fake = ors()
    const api = client(createMemoryStore<LocalData>(), fake, 'proven')
    await withKey(api)
    expect((await rejection(api.createOptimizationJob(REQUEST))).status).toBe(422)
    expect(fake.asked).toEqual([])
  })

  it('checks the key and the profile in the settings', async () => {
    const api = client(createMemoryStore<LocalData>(), ors())
    const error = await rejection(
      api.updateDeviceSettings({ ...DEFAULT_SETTINGS, orsApiKey: 'ima razmak', orsProfile: 'driving-bike' as OrsProfile }),
    )
    expect(error.problem.errors).toEqual({
      orsApiKey: 'Ključ ne sme da sadrži razmake.',
      orsProfile: 'Nepoznata vrsta vozila.',
    })
    expect((await api.updateDeviceSettings({ ...DEFAULT_SETTINGS, orsApiKey: '  ' })).orsApiKey).toBeNull()
    expect((await api.updateDeviceSettings({ ...DEFAULT_SETTINGS, orsApiKey: ' abc123 ' })).orsApiKey).toBe('abc123')
  })

  describe('road lines for the map', () => {
    /** The stops of a route as [lat, lon], one per run of stops at the same place. */
    async function stopsOf(api: ApiClient, route: { stops: RouteStop[] }) {
      const at = new Map((await api.listLocations()).map((l) => [l.id, [l.lat, l.lon] as [number, number]]))
      return route.stops.filter((s, i) => i === 0 || s.locationId !== route.stops[i - 1].locationId).map((s) => at.get(s.locationId))
    }

    const lastJobId = async (api: ApiClient) => (await api.getLatestOptimizationJob())!.id

    it('gives no line without a key, and asks nothing', async () => {
      const fake = ors()
      const api = client(createMemoryStore<LocalData>(), fake)
      const result = await solve(api)
      const id = await lastJobId(api)
      for (const route of result.routes) expect(await api.getRouteLine(id, route.truckId)).toBeNull()
      expect(fake.lines).toEqual([])
    })

    it('follows the road through the stops, asked once per route, also after a restart', async () => {
      const store = createMemoryStore<LocalData>()
      const fake = ors()
      const api = client(store, fake)
      await withKey(api)
      const result = await solve(api)
      const id = await lastJobId(api)
      const route = result.routes[0]

      const line = await api.getRouteLine(id, route.truckId)
      const stops = await stopsOf(api, route)
      expect(fake.lines).toHaveLength(1)
      expect(fake.lines[0].url).toBe('https://api.heigit.org/openrouteservice/v2/directions/driving-hgv/geojson')
      expect(fake.lines[0].waypoints).toEqual(stops.map((p) => [p![1], p![0]]))
      expect(line?.profile).toBe('driving-hgv')
      // Every stop, and between every two the bend of the road.
      expect(line?.path).toHaveLength(2 * stops.length - 1)
      expect(line?.path.filter((_, i) => i % 2 === 0)).toEqual(stops)
      const [from, bend, to] = line!.path
      const round = (n: number) => Math.round(n * 1e5) / 1e5
      expect(bend).toEqual([round((from[0] + to[0]) / 2 + 0.1), round((from[1] + to[1]) / 2)])

      expect(await api.getRouteLine(id, route.truckId)).toEqual(line)
      expect(await client(store, fake).getRouteLine(id, route.truckId)).toEqual(line)
      expect(fake.lines).toHaveLength(1)
      expect(Object.keys(storedData(store).routeLineCache ?? {})).toHaveLength(1)
    })

    it('asks once when the same route is asked for twice at the same time', async () => {
      const fake = ors()
      const api = client(createMemoryStore<LocalData>(), fake)
      await withKey(api)
      const result = await solve(api)
      const id = await lastJobId(api)
      const truckId = result.routes[0].truckId
      const [a, b] = await Promise.all([api.getRouteLine(id, truckId), api.getRouteLine(id, truckId)])
      expect(a).toEqual(b)
      expect(fake.lines).toHaveLength(1)
    })

    it('follows the roads of the distances of the job; for a great-circle job, the profile in the settings', async () => {
      const fake = ors()
      const api = client(createMemoryStore<LocalData>(), fake)
      const airline = await solve(api)
      const airlineJob = await lastJobId(api)
      await withKey(api)
      const road = await solve(api)
      const roadJob = await lastJobId(api)
      await withKey(api, 'driving-car')

      expect((await api.getRouteLine(roadJob, road.routes[0].truckId))?.profile).toBe('driving-hgv')
      expect((await api.getRouteLine(airlineJob, airline.routes[0].truckId))?.profile).toBe('driving-car')
      expect(fake.lines.map((l) => l.url.split('/').at(-2))).toEqual(['driving-hgv', 'driving-car'])
    })

    it('answers 502 when ORS does not answer, keeps nothing, and works once it answers', async () => {
      const store = createMemoryStore<LocalData>()
      let answer: Answer = 'ok'
      const fake = ors(() => answer)
      const api = client(store, fake)
      await withKey(api)
      const result = await solve(api)
      const id = await lastJobId(api)
      answer = 'down'
      const error = await rejection(api.getRouteLine(id, result.routes[0].truckId))
      expect(error.problem).toMatchObject({
        title: 'Linija po putu nije dostupna',
        status: 502,
        detail: 'OpenRouteService nije izračunao liniju puta (HTTP 503).',
      })
      expect(storedData(store).routeLineCache ?? {}).toEqual({})
      answer = 'ok'
      expect((await api.getRouteLine(id, result.routes[0].truckId))?.profile).toBe('driving-hgv')
    })

    it('answers 404 for an unknown job or truck, and 409 for a job without a result', async () => {
      let release: () => void = () => {}
      const held = new Promise<void>((resolve) => (release = resolve))
      const api = createLocalApiClient({
        scenario: SCENARIOS.small,
        runSolver: async (input, options) => held.then(() => steps(input, options)),
        store: createMemoryStore<LocalData>(),
        ors: { fetch: ors().fetch, minIntervalMs: 0 },
      })
      expect((await rejection(api.getRouteLine(99, 1))).status).toBe(404)
      const { id: waiting } = await api.createOptimizationJob(REQUEST)
      expect((await rejection(api.getRouteLine(waiting, 1))).status).toBe(409)
      release()
      expect((await settle(api, waiting)).status).toBe('COMPLETED')
      expect((await rejection(api.getRouteLine(waiting, 999))).status).toBe(404)
    })

    it(`keeps only the last ${KEPT_ROUTE_LINES} lines`, async () => {
      const first = createMemoryStore<LocalData>()
      const api = client(first, ors())
      await withKey(api)
      const result = await solve(api)
      const id = await lastJobId(api)
      await written()
      const old = Array.from({ length: KEPT_ROUTE_LINES }, (_, i): [string, Array<[number, number]>] => [`old-${i}`, [[45, 20]]])
      const store = createMemoryStore<LocalData>({
        version: 1,
        data: { ...storedData(first), routeLineCache: Object.fromEntries(old) },
      })

      await client(store, ors()).getRouteLine(id, result.routes[0].truckId)
      const kept = Object.keys(storedData(store).routeLineCache ?? {})
      expect(kept).toHaveLength(KEPT_ROUTE_LINES)
      expect(kept.slice(0, 2)).toEqual(['old-1', 'old-2'])
      expect(kept.at(-1)).toMatch(/^driving-hgv\|/)
    })
  })
})
