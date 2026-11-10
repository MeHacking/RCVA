import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { createMemoryStore, DeviceStoreError, type DeviceStore } from '../../src/api/local/deviceStore'
import {
  createLocalApiClient,
  DEFAULT_SETTINGS,
  EMPTY_START,
  KEPT_JOBS,
  KEPT_ROUTE_LINES,
  type LocalApiOptions,
  type LocalData,
} from '../../src/api/local/localClient'
import { TERMINAL_JOB_STATUSES, type Location, type OptimizationJob, type OrsProfile, type RouteStop } from '../../src/api/types'
import type { SolverRunner } from '../../src/domain/optimization/solverRunner'
import { runInThread } from '../../src/domain/optimization/solverRunner'
import { SCENARIOS, type Scenario, type ScenarioName } from '../../src/fixtures'
import { STANDARD_TRUCK } from '../../src/domain/fleet'
import { haversineMeters, type LatLon } from '../../src/domain/optimization/distance'

const REQUEST = { timeLimitSeconds: 60, truckIds: null, shipmentIds: null }

/** The real solver on this thread, with a step limit instead of the job's time limit. */
const steps: SolverRunner = (input) => runInThread(input, { seed: 1, stepLimit: 3000 })

// Invented workbook: one row whose places the mock gazetteer knows.
const SHEET = [
  ['RELACIJA', 'TEŽINA', 'DIMENZIJE'],
  ['BEOGRAD 34131 - LJUNGBY', '1,200 kg', '2,4m'],
]

function setup(
  scenario: ScenarioName | LocalApiOptions['scenario'],
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
    const at = new Map((await api.listLocations()).map((l) => [l.id, l]))
    for (const route of result.routes) {
      // The scenario's trucks are at its base; the first leg is from there.
      expect(route.startLocationId).toBe(SCENARIOS.small.base.baseLocationId)
      const base = at.get(route.startLocationId!)!
      const first = at.get(route.stops[0].locationId)!
      expect(route.stops[0].legMeters).toBe(first.id === base.id ? 0 : haversineMeters(base as LatLon, first as LatLon))
      const deliveries = route.stops.filter((s) => s.type === 'DELIVERY').map((s) => s.shipmentId)
      const pickups = route.stops.filter((s) => s.type === 'PICKUP').map((s) => s.shipmentId)
      expect(new Set(deliveries)).toEqual(new Set(pickups))
      expect(rearLoaded(route.stops)).toBe(true)
    }
  })

  it('uses only the listed trucks: without enough of them NOT_FOUND, or a plan without some shipments', async () => {
    // 3 x 7,0 LDM need three trucks; the scenario has two, and none is added.
    const api = setup('notFound')
    const { id } = await api.createOptimizationJob(REQUEST)
    const job = await settle(api, id)
    expect([job.status, job.infeasibilityKind]).toEqual(['INFEASIBLE', 'NOT_FOUND'])
    expect((await api.listTrucks()).map((t) => t.name)).toEqual(['Šleper 1', 'Šleper 2'])

    // Asked for, the job plans what fits and lists the rest.
    const partial = await api.createOptimizationJob({ ...REQUEST, allowUnassigned: true })
    expect((await settle(api, partial.id)).status).toBe('COMPLETED')
    const result = await api.getOptimizationResult(partial.id)
    expect(result.trucksUsed).toBe(2)
    expect(result.unassignedShipmentIds).toHaveLength(1)
    expect(result.validation).toEqual({ passed: true, violations: [] })
    // Nothing is advised for a plan that leaves shipments out.
    expect(result.extraTruck).toBeUndefined()
  })

  it('refuses (422) a job its trucks cannot carry, with the number of standard trucks missing', async () => {
    const small = SCENARIOS.small
    const oneTruck: Scenario = { ...small, trucks: small.trucks.filter((t) => t.id === 1) }
    const runSolver = vi.fn(steps)
    const api = setup(oneTruck, runSolver)
    const error = await rejection(api.createOptimizationJob(REQUEST))
    expect(error.problem).toMatchObject({
      status: 422,
      infeasibilityKind: 'PROVEN',
      causes: ['Ukupno 20,9 LDM je više od kapaciteta dostupnih kamiona (13,6 LDM).'],
      missingTrucks: 1,
    })
    expect(runSolver).not.toHaveBeenCalled()
    // Planned without some shipments, it starts.
    const { id } = await api.createOptimizationJob({ ...REQUEST, allowUnassigned: true })
    expect((await settle(api, id)).status).toBe('COMPLETED')
    expect((await api.getOptimizationResult(id)).unassignedShipmentIds.length).toBeGreaterThan(0)

    // A shipment no standard truck carries either: no number of trucks helps.
    const tooBig: Scenario = { ...oneTruck, shipments: [{ ...small.shipments[0], ldmTenths: 140 }] }
    expect((await rejection(setup(tooBig).createOptimizationJob(REQUEST))).problem.missingTrucks).toBeUndefined()
  })

  it('refuses (409) a job while a truck does not know where it is', async () => {
    const api = setup('small')
    const created = await api.createTruck({ ...SCENARIOS.small.trucks[0], name: 'Nova cerada' })
    const error = await rejection(api.createOptimizationJob(REQUEST))
    expect(error.problem).toMatchObject({
      status: 409,
      detail: 'Kamioni bez potvrđene lokacije (1): Nova cerada. Unesite ili potvrdite gde se nalaze pre pokretanja optimizacije.',
    })
    // An unavailable truck needs no location.
    await api.updateTruck(created.id, { ...SCENARIOS.small.trucks[0], name: 'Nova cerada', available: false })
    expect((await api.createOptimizationJob(REQUEST)).status).toBe('QUEUED')
  })

  it('does not give the solver unavailable trucks', async () => {
    const given: number[][] = []
    const spy: SolverRunner = (input, options) => {
      given.push(input.trucks.map((t) => t.id))
      return steps(input, options)
    }
    const api = setup('small', spy)
    await settle(api, (await api.createOptimizationJob(REQUEST)).id)
    // Šleper 1 and 2; Solo 1 (id 3) is unavailable. The advice adds one standard truck.
    expect(given[0]).toEqual([1, 2])
    expect(given[1]).toEqual([1, 2, -1])
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
    // Šleper 1 carries at most 5 t, Šleper 2 has no payload.
    expect(given[0]).toEqual([5000, Infinity])

    const tooHeavy: Scenario = {
      ...heavy,
      trucks: heavy.trucks.map((t) => ({ ...t, capacityKg: 20_000 })),
      shipments: small.shipments.map((s) => (s.id === 101 ? { ...s, weightKg: 30_000 } : s)),
    }
    const error = await rejection(setup(tooHeavy).createOptimizationJob(REQUEST))
    expect(error.problem.causes).toEqual([
      'Pošiljka S-101 (30000 kg) je teža od najveće nosivosti kamiona (20000 kg).',
      'Ukupno 43100 kg je više od nosivosti dostupnih kamiona (40000 kg).',
    ])
    // A standard truck carries 24 t: no number of them helps.
    expect(error.problem.missingTrucks).toBeUndefined()

    // Without trucks: none is available, and one standard truck would be enough.
    const alone: Scenario = { ...small, trucks: [] }
    const single = await rejection(setup(alone).createOptimizationJob(REQUEST))
    expect(single.problem).toMatchObject({ causes: ['Nijedan kamion nije dostupan.'], missingTrucks: 2 })
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

    // A place keeps what the job uses while a job waits or runs.
    const [someplace] = await api.listLocations()
    const accepted = { lat: 57.7, lon: 12.9, label: 'x', country: 'SE' }
    expect((await rejection(api.applyPlaceSearch(someplace.id, accepted))).status).toBe(409)

    // A truck cannot be removed while a job waits or runs.
    expect((await rejection(api.deleteTruck(1))).status).toBe(409)

    // The advice solves the same shipments again, as long, with one truck more.
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual([5000, 5000])
    expect((await api.getOptimizationJob(first.id)).status).toBe('RUNNING')
    release()
    expect((await settle(api, first.id)).status).toBe('COMPLETED')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual([5000, 5000, 7000])
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))
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
  const measures = { capacityLdmTenths: 136, capacityKg: 24_000, innerLengthMm: 13_600, innerWidthMm: 2480, innerHeightMm: 2700 }
  const TRUCK = { name: 'Cerada 7', available: true, ...measures }

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
    // No job used truck 2, so its id is free again: the smallest free id, not a counter.
    expect((await after.createTruck(TRUCK)).id).toBe(2)
    expect((await after.createTruck(TRUCK)).id).toBe(created.id + 1)
  })

  it('keeps the driver of a truck as typed, refuses a phone without the country code, and drops an emptied one', async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup('small', steps, store)
    const created = await api.createTruck({ ...TRUCK, driverName: '  Marko  ', driverPhone: ' +381 64  123 4567' })
    expect(created).toMatchObject({ driverName: 'Marko', driverPhone: '+381 64 123 4567' })
    expect((await setup('small', steps, store).listTrucks()).find((t) => t.id === created.id)).toMatchObject({
      driverName: 'Marko',
      driverPhone: '+381 64 123 4567',
    })

    const bad = await rejection(api.updateTruck(created.id, { ...TRUCK, driverPhone: '064 123 4567' }))
    expect(bad.status).toBe(400)
    expect(bad.problem.errors).toEqual({ driverPhone: 'Broj telefona mora imati pozivni broj zemlje, npr. +381 64 123 4567.' })

    const emptied = await api.updateTruck(created.id, { ...TRUCK, driverName: ' ', driverPhone: '' })
    expect('driverName' in emptied || 'driverPhone' in emptied).toBe(false)
  })

  it('removes every truck and puts them back as they were, ids and locations', async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup('small', steps, store)
    const before = await api.listTrucks()
    const starts = await api.getTruckStarts()

    const removed = await api.deleteAllTrucks()
    expect(removed).toEqual(before)
    expect(await api.listTrucks()).toEqual([])
    // Kept on the device at once, as every change is.
    expect(await setup('small', steps, store).listTrucks()).toEqual([])

    expect(await api.restoreTrucks(removed)).toEqual(before)
    expect(await api.listTrucks()).toEqual(before)
    expect(await api.getTruckStarts()).toEqual(starts)

    // Not over a truck that took one of the ids meanwhile.
    await api.deleteAllTrucks()
    await api.createTruck(TRUCK)
    const taken = await rejection(api.restoreTrucks(removed))
    expect([taken.status, taken.problem.detail]).toEqual([409, 'Id 1 već ima kamion „Cerada 7“.'])
  })

  it('removes no truck while a job waits or runs', async () => {
    // The solver waits until released, so the job is still running when the trucks are asked for.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const api = setup('small', (input, options) => held.then(() => steps(input, options)))
    const { id } = await api.createOptimizationJob(REQUEST)
    const error = await rejection(api.deleteAllTrucks())
    expect(error.problem).toMatchObject({ status: 409, detail: `Optimizacija #${id} je u toku; kamioni se mogu ukloniti kada se završi.` })
    expect(await api.listTrucks()).toHaveLength(3)
    release()
    await settle(api, id)
    expect(await api.deleteAllTrucks()).toHaveLength(3)
  })

  it('goes back to the factory settings: everything gone, the key and the settings too', async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup(EMPTY_START, steps, store)
    await api.createTruck(TRUCK)
    await api.createTruckType({ ...measures, capacityKg: 18_000, name: 'Hladnjača' })
    await api.updateDeviceSettings({ ...(await api.getDeviceSettings())!, orsApiKey: 'tajni-kljuc', extraTruckSavingPercent: 25 })

    await api.resetDevice()
    expect(await api.listTrucks()).toEqual([])
    expect(await api.listTruckTypes()).toEqual([])
    expect(await api.listShipments()).toEqual([])
    const settings = (await api.getDeviceSettings())!
    expect(settings).toEqual(DEFAULT_SETTINGS)
    // Stored at once: the next start finds the same empty device.
    const after = setup(EMPTY_START, steps, store)
    expect(await after.listTrucks()).toEqual([])
    expect((await after.getDeviceSettings())!.orsApiKey).toBeNull()
    // And the ids start again.
    expect((await after.createTruck(TRUCK)).id).toBe(1)
  })

  it('forgets all locations and what was found for them, and keeps the shipments, trucks and results', async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup('small', steps, store)
    const id = (await api.createOptimizationJob(REQUEST)).id
    await settle(api, id)
    const before = { shipments: await api.listShipments(), trucks: await api.listTrucks() }
    const base = SCENARIOS.small.base.baseLocationId
    const saved = (await store.load())!
    saved.geocodeCache = { 'mesto|': { found: true, lat: 1, lon: 2, label: 'x' } }
    saved.noAccessCache = { 'driving-hgv|1,2': true }
    saved.distanceCache = { kept: 1000 }
    saved.locations.find((l) => l.id !== base)!.movedFrom = { lat: 1, lon: 2, geocodeStatus: 'OK' }
    await store.save(saved)

    const api2 = setup('small', steps, store)
    const { places } = await api2.forgetAllPlaces()
    expect(places).toBe(SCENARIOS.small.locations.filter((l) => l.id !== base).length)
    const others = (await api2.listLocations()).filter((l) => l.id !== base)
    expect(others.every((l) => l.lat === null && l.lon === null && l.geocodeStatus === 'FAILED' && !l.movedFrom)).toBe(true)
    expect(others.map((l) => l.name)).toEqual(SCENARIOS.small.locations.filter((l) => l.id !== base).map((l) => l.name))
    expect((await api2.listLocations()).find((l) => l.id === base)!.lat).toBe(SCENARIOS.small.locations.find((l) => l.id === base)!.lat)

    expect(await api2.listShipments()).toEqual(before.shipments)
    const trucks = await api2.listTrucks()
    expect(trucks.map((t) => t.name)).toEqual(before.trucks.map((t) => t.name))
    expect(trucks.every((t) => t.startLocationId === null)).toBe(true)
    // Nothing proposes the place of an old result as where a truck is.
    expect((await api2.getTruckStarts())!.every((s) => s.proposal === null)).toBe(true)
    // The old result is still there to read.
    expect((await api2.getOptimizationResult(id)).routes.length).toBeGreaterThan(0)

    // Stored at once; the kilometres stay, as they are by coordinates and cost requests.
    const stored = storedData(store)
    expect([stored.geocodeCache, stored.noAccessCache, stored.distanceCache]).toEqual([{}, {}, { kept: 1000 }])
    expect((await setup('small', steps, store).listLocations()).filter((l) => l.id !== base)[0].lat).toBeNull()
  })

  it('does not forget the locations while a job waits or runs', async () => {
    let release = () => {}
    const held: Parameters<typeof setup>[1] = async (input, limit) => {
      await new Promise<void>((resolve) => (release = resolve))
      return steps(input, limit)
    }
    const api = setup('small', held)
    await api.createOptimizationJob(REQUEST)
    expect((await rejection(api.forgetAllPlaces())).status).toBe(409)
    expect((await api.listLocations()).some((l) => l.lat !== null)).toBe(true)
    release()
  })

  it('gives a removed truck id again only when no kept job uses it', async () => {
    const api = setup('small', steps)
    // The job drives Šleper 1 and 2; Solo 1 (id 3) is not available, so the job has it not.
    const { id } = await api.createOptimizationJob(REQUEST)
    expect((await settle(api, id)).status).toBe('COMPLETED')
    await api.deleteTruck(2)
    await api.deleteTruck(3)
    // 2 is in the kept job (its result and proposal would show the new truck): skipped.
    expect((await api.createTruck(TRUCK)).id).toBe(3)
    expect((await api.createTruck(TRUCK)).id).toBe(4)
  })

  it('keeps truck types and their next id across a restart; a type changes no truck', async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup('small', steps, store)
    const cold = await api.createTruckType({ ...measures, capacityKg: 18_000, name: ' Hladnjača ' })
    const solo = await api.createTruckType({ ...measures, name: 'Solo', capacityLdmTenths: 70, capacityKg: 9000 })
    expect(cold).toEqual({ id: 1, ...measures, capacityKg: 18_000, name: 'Hladnjača' })
    const trucksBefore = await api.listTrucks()
    const last = await api.createTruckType({ ...measures, capacityKg: 30_000, name: 'Mega' })
    await api.updateTruckType(solo.id, { ...measures, name: 'Solo 7 m', capacityLdmTenths: 75, capacityKg: 9000 })
    await api.deleteTruckType(cold.id)
    await api.deleteTruckType(last.id)
    expect(await api.listTrucks()).toEqual(trucksBefore)

    const after = setup('small', steps, store)
    expect(await after.listTruckTypes()).toEqual([{ id: 2, ...measures, name: 'Solo 7 m', capacityLdmTenths: 75, capacityKg: 9000 }])
    // The id of a removed type is not given again.
    expect((await after.createTruckType({ ...measures, capacityKg: 19_000, name: 'Hladnjača' })).id).toBe(4)
  })

  it('checks a truck type: measures, a name no other type has, and not the built-in one', async () => {
    const api = setup('small')
    await api.createTruckType({ ...measures, capacityKg: 18_000, name: 'Hladnjača' })
    const other = await api.createTruckType({ ...measures, capacityKg: 10_000, name: 'Solo' })

    const missing = await rejection(api.createTruckType({ ...measures, name: 'Bez mera', capacityKg: null, innerLengthMm: null }))
    expect(missing.problem.errors).toEqual({ capacityKg: 'Nosivost je obavezna.', innerLengthMm: 'Obavezno.' })
    const bad = await rejection(api.createTruckType({ ...measures, name: ' ', capacityLdmTenths: 0, innerWidthMm: -1 }))
    expect(bad.status).toBe(400)
    expect(bad.problem.errors).toEqual({
      name: 'Naziv je obavezan.',
      capacityLdmTenths: 'Kapacitet mora biti veći od 0.',
      innerWidthMm: 'Mora biti pozitivan ceo broj.',
    })
    expect((await rejection(api.createTruckType({ ...measures, name: 'HLADNJAČA ' }))).problem.errors).toEqual({
      name: 'Tip sa tim nazivom već postoji.',
    })
    expect((await rejection(api.updateTruckType(other.id, { ...measures, name: 'hladnjača' }))).problem.errors).toEqual({
      name: 'Tip sa tim nazivom već postoji.',
    })
    expect((await rejection(api.createTruckType({ ...measures, name: 'standardna cerada' }))).problem.errors).toEqual({
      name: '„Standardna cerada“ je ugrađen tip; izaberite drugi naziv.',
    })
    // Another name, the same measures: a duplicate as well, of an added type or of the built-in one.
    expect((await rejection(api.createTruckType({ ...measures, capacityKg: 18_000, name: 'Kopija' }))).problem.errors).toEqual({
      name: 'Tip „Hladnjača“ već ima iste mere (kapacitet, nosivost i tovarni prostor).',
    })
    expect((await rejection(api.updateTruckType(other.id, { ...measures, name: 'Solo' }))).problem.errors).toEqual({
      name: 'Tip „Standardna cerada“ već ima iste mere (kapacitet, nosivost i tovarni prostor).',
    })
    // One measure apart is another type.
    await api.createTruckType({ ...measures, capacityKg: 18_000, innerHeightMm: 2600, name: 'Niža hladnjača' })
    // A type keeps its own name when it is saved again.
    await api.updateTruckType(other.id, { ...measures, name: 'Solo', capacityKg: 12_000 })
    expect((await api.listTruckTypes())?.map((t) => t.name)).toEqual(['Hladnjača', 'Solo', 'Niža hladnjača'])

    expect((await rejection(api.updateTruckType(99, { ...measures, name: 'X' }))).status).toBe(404)
    expect((await rejection(api.deleteTruckType(99))).status).toBe(404)
  })

  it('loads a snapshot stored before truck types existed', async () => {
    const store = createMemoryStore<LocalData>()
    await setup('small', steps, store).listTrucks()
    const older: Partial<LocalData> = storedData(store)
    delete older.truckTypes
    delete older.nextTruckTypeId
    const api = setup('small', steps, createMemoryStore<LocalData>({ version: 1, data: older }))
    expect(await api.listTruckTypes()).toEqual([])
    expect((await api.createTruckType({ ...measures, capacityKg: 18_000, name: 'Hladnjača' })).id).toBe(1)
  })

  it('keeps a finished job with its result and 3D plan', async () => {
    const store = createMemoryStore<LocalData>()
    // The solver answers later, as the Web Worker does, so the job is stored while running first.
    const later: SolverRunner = async (input, options) => {
      await written()
      return steps(input, options)
    }
    const api = setup('small', later, store)
    expect(await api.getLatestOptimizationJob()).toBeNull()
    const { id } = await api.createOptimizationJob(REQUEST)
    const job = await settle(api, id)
    const result = await api.getOptimizationResult(id)
    await written()

    const after = setup('small', steps, store)
    expect(await after.getLatestOptimizationJob()).toEqual(job)
    expect(await after.getOptimizationResult(id)).toEqual(result)
    const truckId = result.routes[0].truckId
    expect(await after.getLoadPlan(id, truckId)).toEqual(await api.getLoadPlan(id, truckId))
    expect(await after.listTrucks()).toEqual(await api.listTrucks())
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

    // When each was started is kept for all of them, also after a restart (the dashboard's chart).
    const history = await api.getOptimizationHistory()
    expect(history).toHaveLength(KEPT_JOBS + 2)
    expect(history).toEqual([...history!].sort())
    expect(await setup('small', steps, store).getOptimizationHistory()).toEqual(history)
  })

  it('starts the history of an older snapshot from the jobs it kept', async () => {
    const store = createMemoryStore<LocalData>()
    const api = setup('small', steps, store)
    await settle(api, (await api.createOptimizationJob(REQUEST)).id)
    await written()
    const { jobLog, ...older } = storedData(store)
    expect(jobLog).toHaveLength(1)
    const before = createMemoryStore<LocalData>()
    await before.save(older)
    expect(await setup('small', steps, before).getOptimizationHistory()).toEqual(older.jobs.map((j) => j.createdAt))
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

  function client(store: DeviceStore<LocalData>, fake: { fetch: typeof globalThis.fetch }, rows = ROWS): ApiClient {
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

  describe('a place looked up again', () => {
    /** Teststad is in another town without a country; in Sweden it is the right one. */
    function byCountry() {
      const asked: Array<string | null> = []
      let down = false
      const fetch = (async (input: RequestInfo | URL) => {
        const params = new URL(String(input)).searchParams
        if (down) throw new TypeError('Failed to fetch')
        if (params.get('q') !== 'Teststad') return new Response('[]')
        const country = params.get('countrycodes')
        asked.push(country)
        if (country === 'no') return new Response('[]')
        return new Response(
          JSON.stringify([
            country === 'se'
              ? { lat: '57.7', lon: '12.9', display_name: 'Teststad, Sverige' }
              : { lat: '56.3', lon: '44.0', display_name: 'Teststad, Rossija' },
          ]),
        )
      }) as typeof globalThis.fetch
      return { fetch, asked, goDown: () => (down = true) }
    }
    const setupWrong = async () => {
      const fake = byCountry()
      const store = createMemoryStore<LocalData>()
      const api = client(store, fake)
      await importRows(api)
      const wrong = (await place(api, 'Teststad'))!
      expect(wrong).toMatchObject({ lat: 56.3, country: null })
      return { api, fake, wrong, store }
    }

    it('asks in that country, whatever was kept, and changes nothing yet', async () => {
      const { api, fake, wrong } = await setupWrong()
      const result = await api.searchPlaceAgain(wrong.id, ' se ')
      expect(result).toMatchObject({ name: 'Teststad', country: 'SE', found: { lat: 57.7, lon: 12.9, label: 'Teststad, Sverige' } })
      expect(await place(api, 'Teststad')).toEqual(wrong)

      await api.searchPlaceAgain(wrong.id, 'SE')
      expect(fake.asked).toEqual([null, 'se', 'se'])
    })

    it('says when it is not found, and fails without changing anything', async () => {
      const { api, fake, wrong } = await setupWrong()
      expect((await api.searchPlaceAgain(wrong.id, 'NO')).found).toBeNull()
      expect((await rejection(api.searchPlaceAgain(9999, 'SE'))).status).toBe(404)

      fake.goDown()
      expect((await rejection(api.searchPlaceAgain(wrong.id, 'SE'))).status).toBe(502)
      expect(await place(api, 'Teststad')).toEqual(wrong)
    })

    it('asks nothing when the lookup is switched off', async () => {
      const { api, fake, wrong } = await setupWrong()
      await api.updateDeviceSettings({ ...(await api.getDeviceSettings())!, geocodingEnabled: false })
      expect((await rejection(api.searchPlaceAgain(wrong.id, 'SE'))).status).toBe(409)
      expect(fake.asked).toEqual([null])
    })

    it('gives the place what was accepted, also after a restart, and drops a kept move to the road', async () => {
      const { wrong, store } = await setupWrong()
      const saved = (await store.load())!
      saved.locations.find((l) => l.id === wrong.id)!.movedFrom = { lat: 56.2, lon: 44, geocodeStatus: 'OK' }
      await store.save(saved)
      const accepted = { lat: 57.7, lon: 12.9, label: 'Teststad, Sverige', country: 'SE' }
      const place2 = await client(store, nominatim()).applyPlaceSearch(wrong.id, accepted)
      expect(place2).toMatchObject({ id: wrong.id, lat: 57.7, lon: 12.9, country: 'SE', geocodeStatus: 'MANUAL', movedFrom: null })

      expect(await place(client(store, nominatim()), 'Teststad')).toMatchObject({ lat: 57.7, country: 'SE' })
    })

    it('does not bring the wrong point back when the place is imported again without a country', async () => {
      const { api, fake, wrong } = await setupWrong()
      await api.applyPlaceSearch(wrong.id, { lat: 57.7, lon: 12.9, label: 'Teststad, Sverige', country: 'SE' })
      await api.deleteAllShipments()
      expect(await place(api, 'Teststad')).toBeUndefined()

      await importRows(api)
      expect(await place(api, 'Teststad')).toMatchObject({ lat: 57.7, lon: 12.9 })
      expect(fake.asked).toEqual([null])
    })

    it('refuses bad coordinates and an unknown place', async () => {
      const { api, wrong } = await setupWrong()
      const accepted = { lat: 57.7, lon: 12.9, label: 'x', country: 'SE' }
      expect((await rejection(api.applyPlaceSearch(wrong.id, { ...accepted, lat: 91 }))).status).toBe(400)
      expect((await rejection(api.applyPlaceSearch(9999, accepted))).status).toBe(404)
      expect(await place(api, 'Teststad')).toEqual(wrong)
    })
  })

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

  it('takes a place written with two different numbers in one file as one place', async () => {
    const fake = nominatim()
    const rows = [...ROWS.slice(0, 2), ['PRIMEROVO - TESTSTAD 22222', '800 kg', '1,2m']]
    const api = client(createMemoryStore<LocalData>(), fake, rows)
    const progress: string[] = []
    const result = await importRows(api, (p) => progress.push(`${p.done}/${p.total}`))
    expect(fake.names()).toEqual(['Primerovo', 'Teststad'])
    expect(progress).toEqual(['0/2', '1/2', '2/2'])
    expect(result.geocoding).toEqual({ found: 2, notFound: 0, failed: 0, message: null })
    const shipments = (await api.listShipments()).slice(-2)
    expect(shipments[0].deliveryLocationId).toBe(shipments[1].deliveryLocationId)
  })

  it('never asks the same place again, also "not found" and after a restart', async () => {
    const store = createMemoryStore<LocalData>()
    const first = nominatim()
    await importRows(client(store, first))
    expect(first.asked).toHaveLength(3)

    // Teststad without its number is the same place (the number is not compared), so only
    // Drugstad, which has no coordinates, is looked up again, and only in what is kept.
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
    expect(result.geocoding).toEqual({ found: 0, notFound: 1, failed: 0, message: null })
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
      extraTruckSavingPercent: 10,
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
        const before = route.stops[i - 1]?.locationId ?? route.startLocationId!
        const expected = before === stop.locationId ? 0 : road(at.get(before)!, at.get(stop.locationId)!)
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

  describe('a place lorries do not reach', () => {
    const closedId = SCENARIOS.small.shipments[0].deliveryLocationId
    const closed = SCENARIOS.small.locations.find((l) => l.id === closedId)!
    const isClosed = (p: number[]) => Math.abs(p[0] - closed.lon!) < 1e-9 && Math.abs(p[1] - closed.lat!) < 1e-9

    /**
     * ORS Snap finds no road around the place, and for the place itself: a road 0,01° north of it
     * ('north'), none ('none'), or that very point, which the search then finds open ('here').
     */
    function closedPlace(road_: 'north' | 'none' | 'here') {
      const calls = { snap: 0, matrix: 0 }
      const sent: number[][][] = []
      const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { locations: number[][]; sources: number[]; destinations: number[] }
        if (String(input).includes('/snap/')) {
          calls.snap++
          const roadAt = (lon: number, lat: number) =>
            road_ === 'north' ? { location: [lon, lat + 0.01], name: 'Teretna ulica' } : road_ === 'here' ? { location: [lon, lat] } : null
          const locations = body.locations.map(([lon, lat]) => (isClosed([lon, lat]) ? roadAt(lon, lat) : null))
          return new Response(JSON.stringify({ locations }))
        }
        calls.matrix++
        sent.push(body.locations)
        const open = road_ === 'here' && calls.matrix > 1
        const at = (i: number) => body.locations[i]
        const distances = body.sources.map((s) =>
          body.destinations.map((d) =>
            !open && s !== d && (isClosed(at(s)) || isClosed(at(d))) ? null : road({ lon: at(s)[0], lat: at(s)[1] }, { lon: at(d)[0], lat: at(d)[1] }),
          ),
        )
        return new Response(JSON.stringify({ distances }))
      }) as typeof globalThis.fetch
      const store = createMemoryStore<LocalData>()
      const make = () => createLocalApiClient({ scenario: SCENARIOS.small, runSolver: steps, store, ors: { fetch, minIntervalMs: 0 } })
      return { calls, sent, make }
    }

    it('leaves a place where it is when the point found is that very point, and does not search again', async () => {
      const { calls, make } = closedPlace('here')
      const api = make()
      await withKey(api)
      expect((await rejection(api.createOptimizationJob(REQUEST))).status).toBe(409)
      expect(calls).toEqual({ snap: 1, matrix: 2 })
      expect((await api.listLocations()).find((l) => l.id === closedId)?.movedFrom).toBeUndefined()

      expect((await rejection(api.createOptimizationJob(REQUEST))).status).toBe(409)
      expect(calls).toEqual({ snap: 1, matrix: 2 })
    })

    it('moves only that place, on its own, spending three matrix requests and one snap, and the job runs', async () => {
      const { calls, sent, make } = closedPlace('north')
      const api = make()
      await withKey(api)
      expect((await solve(api)).validation.passed).toBe(true)
      expect(calls).toEqual({ snap: 1, matrix: 3 })

      // Checked against the nearest place that is fine.
      const toClosed = ([lon, lat]: number[]) => haversineMeters({ lat, lon }, { lat: closed.lat!, lon: closed.lon! })
      const fine = sent[0].filter((p) => !isClosed(p)).sort((a, b) => toClosed(a) - toClosed(b))
      expect(fine.length).toBeGreaterThan(1)
      expect(sent[1][0]).toEqual(fine[0])

      const from = { lat: closed.lat, lon: closed.lon, geocodeStatus: closed.geocodeStatus }
      const places = await api.listLocations()
      expect(places.find((l) => l.id === closedId)).toMatchObject({ lat: closed.lat! + 0.01, geocodeStatus: closed.geocodeStatus, movedFrom: from })
      expect(places.filter((l) => l.movedFrom)).toHaveLength(1)

      // In the data file too, and the next job asks nothing.
      const file = (await api.exportDeviceData())!
      expect((JSON.parse(file.content) as { data: { locations: Location[] } }).data.locations.find((l) => l.id === closedId)?.movedFrom).toEqual(from)
      await solve(api)
      expect(calls).toEqual({ snap: 1, matrix: 3 })

      // And it goes back there, with the status it had; then there is nothing more to put back.
      const back = await api.restoreRoadPoint(closedId)
      expect(back).toMatchObject({ lat: closed.lat, lon: closed.lon, geocodeStatus: closed.geocodeStatus, movedFrom: null })
      const again = await rejection(api.restoreRoadPoint(closedId))
      expect([again.status, again.problem.detail]).toEqual([409, `„${closed.name}“ nije pomereno do puta za kamione.`])
      expect((await rejection(api.restoreRoadPoint(9999))).status).toBe(404)
    })

    it('names only that place when nothing is found, and does not search for it again', async () => {
      const { calls, make } = closedPlace('none')
      const api = make()
      await withKey(api)
      const refused = await rejection(api.createOptimizationJob(REQUEST))
      expect(refused.status).toBe(409)
      expect(refused.problem.noRoadPlaceIds).toEqual([closedId])
      expect(calls).toEqual({ snap: 6, matrix: 1 })
      expect((await api.listLocations()).find((l) => l.id === closedId)).toMatchObject({ lat: closed.lat })

      // Also after a restart.
      expect((await rejection(api.createOptimizationJob(REQUEST))).status).toBe(409)
      expect((await rejection(make().createOptimizationJob(REQUEST))).status).toBe(409)
      expect(calls).toEqual({ snap: 6, matrix: 1 })
    })
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
    /** The points of a route's line: where the truck was, then the stops, each place once in a row. */
    async function stopsOf(api: ApiClient, route: { startLocationId?: number; stops: RouteStop[] }) {
      const at = new Map((await api.listLocations()).map((l) => [l.id, [l.lat, l.lon] as [number, number]]))
      const ids = [route.startLocationId!, ...route.stops.map((s) => s.locationId)]
      return ids.filter((id, i) => i === 0 || id !== ids[i - 1]).map((id) => at.get(id))
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

describe('an empty device and a new week', () => {
  /** Nominatim that finds every place at the same point. */
  const anywhere = {
    fetch: (async (input: RequestInfo | URL) =>
      new Response(JSON.stringify([{ lat: '45.0', lon: '20.0', display_name: new URL(String(input)).searchParams.get('q') }]))) as typeof globalThis.fetch,
    minIntervalMs: 0,
  }

  function device(scenario: LocalApiOptions['scenario'], store = createMemoryStore<LocalData>(), runSolver: SolverRunner = steps) {
    return createLocalApiClient({
      scenario,
      runSolver,
      store,
      readWorkbook: async () => [{ sheet: 'Sheet1', data: SHEET }],
      nominatim: anywhere,
    })
  }

  async function importSheet(api: ApiClient, name: string) {
    const { importId } = await api.createImport(new File(['fake'], name))
    await api.setImportMapping(importId, { sheetName: 'Sheet1', headerRow: 1, columns: { relation: 0, weight: 1, ldm: 2 } })
    return api.commitImport(importId)
  }

  it('starts without shipments, places and trucks, and imports into that', async () => {
    const api = device(EMPTY_START)
    expect([await api.listShipments(), await api.listLocations(), await api.listTrucks()]).toEqual([[], [], []])
    expect((await rejection(api.createOptimizationJob(REQUEST))).problem.detail).toBe('Nema pošiljki za optimizaciju.')

    expect((await importSheet(api, 'Nedelja-1.xlsx')).created).toBe(1)
    const refused = await rejection(api.createOptimizationJob(REQUEST))
    expect(refused.problem).toMatchObject({ status: 422, causes: ['Nijedan kamion nije dostupan.'], missingTrucks: 1 })

    // The user adds the truck and says where it is (Nominatim finds every place here).
    const truck = await api.createTruck({ name: 'Kamion 1', ...STANDARD_TRUCK, available: true })
    expect(await api.setTruckStart(truck.id, { place: { name: 'Primerovo', postalCode: null, country: 'RS' } })).toMatchObject({
      outcome: 'found',
      truck: { startLocationId: expect.any(Number) },
    })
    const { id } = await api.createOptimizationJob(REQUEST)
    expect((await settle(api, id)).status).toBe('COMPLETED')
  })

  it('removes all shipments and the places no kept result uses, and stores that', async () => {
    const store = createMemoryStore<LocalData>()
    const api = device(SCENARIOS.small, store)
    const before = await api.listLocations()
    // Without a job only the base stays.
    expect(await api.deleteAllShipments()).toEqual({ shipments: 5, locations: before.length - 1 })
    expect(await api.listShipments()).toEqual([])
    expect((await api.listLocations()).map((l) => l.id)).toEqual([SCENARIOS.small.base.baseLocationId])
    expect(storedData(store).shipments).toEqual([])
  })

  it('keeps the places of a kept result, and never gives a removed shipment id again', async () => {
    const api = device(SCENARIOS.small)
    const { id } = await api.createOptimizationJob(REQUEST)
    expect((await settle(api, id)).status).toBe('COMPLETED')
    const result = await api.getOptimizationResult(id)
    const resultPlaces = new Set(result.routes.flatMap((r) => r.stops.map((s) => s.locationId)))

    await api.deleteAllShipments()
    const kept = new Set((await api.listLocations()).map((l) => l.id))
    expect([...resultPlaces].every((place) => kept.has(place))).toBe(true)

    await importSheet(api, 'Nedelja-2.xlsx')
    const [created] = await api.listShipments()
    const oldIds = SCENARIOS.small.shipments.map((s) => s.id)
    expect(created.id).toBeGreaterThan(Math.max(...oldIds))
  })

  it('answers 409 while a job runs', async () => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const api = device(SCENARIOS.small, createMemoryStore<LocalData>(), (input, options) => held.then(() => steps(input, options)))
    const { id } = await api.createOptimizationJob(REQUEST)
    const error = await rejection(api.deleteAllShipments())
    expect(error.problem).toMatchObject({ status: 409, detail: `Optimizacija #${id} je u toku; pošiljke se mogu ukloniti kada se završi.` })
    expect(await api.listShipments()).toHaveLength(5)
    release()
    await settle(api, id)
  })
})
