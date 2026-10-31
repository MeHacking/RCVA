import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { createMemoryStore, DeviceStoreError, type DeviceStore } from '../../src/api/local/deviceStore'
import { createLocalApiClient, KEPT_JOBS, type LocalData } from '../../src/api/local/localClient'
import { TERMINAL_JOB_STATUSES, type OptimizationJob, type RouteStop } from '../../src/api/types'
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
