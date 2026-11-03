import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { createMemoryStore, type DeviceStore } from '../../src/api/local/deviceStore'
import { createLocalApiClient, DEFAULT_SETTINGS, type LocalApiOptions, type LocalData } from '../../src/api/local/localClient'
import { TERMINAL_JOB_STATUSES, type OptimizationJobRequest } from '../../src/api/types'
import { runInThread, type SolverRunner } from '../../src/domain/optimization/solverRunner'
import { SCENARIOS, type Scenario } from '../../src/fixtures'
import { location, shipment, truck } from '../../src/fixtures/scenario'

// Where the trucks are (NOT IN SPEC v2), the proposal from a truck's last delivery, and the
// advice "one more truck, fewer kilometres". Nominatim is faked: it knows only Primerovo.

const REQUEST: OptimizationJobRequest = { timeLimitSeconds: 60, truckIds: null, shipmentIds: null }
const steps: SolverRunner = (input) => runInThread(input, { seed: 1, stepLimit: 3000 })

function nominatim() {
  const fake = {
    asked: [] as string[],
    fetch: (async (input: RequestInfo | URL) => {
      const q = new URL(String(input)).searchParams.get('q') ?? ''
      fake.asked.push(q)
      return new Response(JSON.stringify(q === 'Primerovo' ? [{ lat: '45.1', lon: '20.1', display_name: q }] : []))
    }) as typeof fetch,
  }
  return fake
}

function device(
  scenario: LocalApiOptions['scenario'] = SCENARIOS.small,
  runSolver: SolverRunner = steps,
  store: DeviceStore<LocalData> = createMemoryStore<LocalData>(),
  fake = nominatim(),
) {
  const api = createLocalApiClient({ scenario, runSolver, store, nominatim: { fetch: fake.fetch, minIntervalMs: 0 } })
  return { api, fake, store }
}

async function settle(api: ApiClient, id: number) {
  for (let i = 0; i < 200; i++) {
    const job = await api.getOptimizationJob(id)
    if (TERMINAL_JOB_STATUSES.includes(job.status)) return job
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('job did not finish')
}

async function solved(api: ApiClient, request = REQUEST) {
  const { id } = await api.createOptimizationJob(request)
  expect((await settle(api, id)).status).toBe('COMPLETED')
  return { id, result: await api.getOptimizationResult(id) }
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

const startOf = async (api: ApiClient, truckId: number) => (await api.getTruckStarts())!.find((s) => s.truckId === truckId)!

describe('where a truck is', () => {
  it('takes a place typed by hand: known, looked up, or with coordinates by hand', async () => {
    const { api, fake } = device()
    // Subotica is a shipment's place with coordinates: nothing is asked.
    const known = await api.setTruckStart(1, { place: { name: 'subotica', postalCode: null, country: null } })
    expect(known).toMatchObject({ outcome: 'known', name: 'subotica', message: null, truck: { id: 1, startLocationId: 2 } })
    expect((await startOf(api, 1)).location).toMatchObject({ id: 2, name: 'Subotica' })

    const found = await api.setTruckStart(2, { place: { name: 'Primerovo', postalCode: null, country: 'RS' } })
    expect(found.outcome).toBe('found')
    expect((await startOf(api, 2)).location).toMatchObject({ name: 'Primerovo', lat: 45.1, lon: 20.1, geocodeStatus: 'MANUAL' })

    const byHand = await api.setTruckStart(2, { place: { name: 'Nigdeovo', postalCode: null, country: null, coordinates: { lat: 44, lon: 21 } } })
    expect(byHand.outcome).toBe('manual')
    expect((await startOf(api, 2)).location).toMatchObject({ name: 'Nigdeovo', lat: 44, lon: 21, geocodeStatus: 'MANUAL' })
    expect(fake.asked).toEqual(['Primerovo'])
  })

  it('leaves the truck as it was when the place is not found, and makes no place', async () => {
    const { api, fake } = device()
    const before = await api.listLocations()
    const result = await api.setTruckStart(1, { place: { name: 'Nigdeovo', postalCode: null, country: null } })
    expect(result).toMatchObject({ outcome: 'notFound', name: 'Nigdeovo', truck: { startLocationId: 1 } })
    expect(await api.listLocations()).toEqual(before)
    // Typed again, it is asked again.
    await api.setTruckStart(1, { place: { name: 'Nigdeovo', postalCode: null, country: null } })
    expect(fake.asked).toEqual(['Nigdeovo', 'Nigdeovo'])
  })

  it('answers 400 by field, 404 for an unknown truck, and 409 while a job runs', async () => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const { api, fake } = device(SCENARIOS.small, (input, options) => held.then(() => steps(input, options)))
    expect((await rejection(api.setTruckStart(1, { place: { name: ' ', postalCode: null, country: null } }))).problem.errors).toEqual({
      place: 'Unesite mesto.',
    })
    const range = await rejection(api.setTruckStart(1, { place: { name: 'X', postalCode: null, country: null, coordinates: { lat: 0, lon: 200 } } }))
    expect(range.problem.errors).toEqual({ coordinates: 'Geografska širina mora biti između -90 i 90, a dužina između -180 i 180.' })
    expect((await rejection(api.setTruckStart(99, { place: { name: 'Primerovo', postalCode: null, country: null } }))).status).toBe(404)

    const { id } = await api.createOptimizationJob(REQUEST)
    const busy = await rejection(api.setTruckStart(1, { place: { name: 'Primerovo', postalCode: null, country: null } }))
    expect(busy.problem).toMatchObject({ status: 409, detail: `Optimizacija #${id} je u toku; lokacija kamiona se može menjati kada se završi.` })
    expect(fake.asked).toEqual([])
    release()
    await settle(api, id)
  })

  it('keeps where a truck is through a change of the truck, a restart and "Ukloni sve pošiljke"', async () => {
    const store = createMemoryStore<LocalData>()
    const { api } = device(SCENARIOS.small, steps, store)
    await api.setTruckStart(1, { place: { name: 'Subotica', postalCode: null, country: null } })
    const [first] = await api.listTrucks()
    await api.updateTruck(1, { ...SCENARIOS.small.trucks[0], name: 'Šleper 1a' })
    expect((await api.listTrucks())[0]).toMatchObject({ name: 'Šleper 1a', startLocationId: first.startLocationId })

    // Subotica is no shipment's place any more, but the truck is there.
    await api.deleteAllShipments()
    expect((await api.listLocations()).map((l) => l.name)).toContain('Subotica')
    const restarted = device(SCENARIOS.small, steps, store).api
    expect((await startOf(restarted, 1)).location).toMatchObject({ name: 'Subotica' })
  })
})

describe('the proposal from the last delivery', () => {
  it('proposes each used truck its last delivery, used only once confirmed, and once per job', async () => {
    const { api } = device()
    expect((await api.getTruckStarts())!.map((s) => s.proposal)).toEqual([null, null, null])
    const { id, result } = await solved(api)

    for (const route of result.routes) {
      const start = await startOf(api, route.truckId)
      // Confirmed is still the base; the last delivery is only proposed.
      expect(start.location).toMatchObject({ id: 1 })
      expect(start.proposal).toMatchObject({ jobId: id, location: { id: route.stops.at(-1)!.locationId } })
    }
    // Solo 1 has no route: nothing to propose.
    expect((await startOf(api, 3)).proposal).toBeNull()

    const truckId = result.routes[0].truckId
    await api.setTruckStart(truckId, { proposalJobId: id })
    const confirmed = await startOf(api, truckId)
    expect(confirmed.location?.id).toBe(result.routes[0].stops.at(-1)!.locationId)
    expect(confirmed.proposal).toBeNull()
    // The same proposal again: it no longer exists.
    expect((await rejection(api.setTruckStart(truckId, { proposalJobId: id }))).status).toBe(409)

    // The next job starts there.
    const next = await solved(api)
    const route = next.result.routes.find((r) => r.truckId === truckId)
    if (route) expect(route.startLocationId).toBe(confirmed.location?.id)
  })

  it('keeps the present location when asked, and the proposal is no longer offered', async () => {
    const { api } = device()
    const { result } = await solved(api)
    const truckId = result.routes[0].truckId
    expect((await startOf(api, truckId)).proposal).not.toBeNull()
    const kept = await api.setTruckStart(truckId, { keep: true })
    expect(kept).toMatchObject({ outcome: 'known', name: 'Beograd – magacin', truck: { startLocationId: 1 } })
    expect(await startOf(api, truckId)).toMatchObject({ location: { id: 1 }, proposal: null })

    // A truck that is nowhere has nothing to keep.
    const created = await api.createTruck({ ...SCENARIOS.small.trucks[0], name: 'Nova' })
    const error = await rejection(api.setTruckStart(created.id, { keep: true }))
    expect(error.problem).toMatchObject({ status: 409, detail: 'Kamion „Nova“ još nema lokaciju koju bi zadržao.' })
  })

  it('does not propose a job older than a place typed by hand', async () => {
    const { api } = device()
    const { result } = await solved(api)
    const truckId = result.routes[0].truckId
    await api.setTruckStart(truckId, { place: { name: 'Primerovo', postalCode: null, country: null } })
    expect((await startOf(api, truckId)).proposal).toBeNull()
  })
})

describe('the advice "one more truck, fewer kilometres"', () => {
  // Test 7 in degrees near the equator (1 degree is about 111 km): from the base, two trucks
  // carry S1+S3 and S2+S4 back and forth (about 1000 km); a third makes it about 570 km.
  const KM = 1 / 111.32
  const place = (id: number, x: number, y: number) => location(id, `Mesto ${id}`, 'RS', null, [y * KM, x * KM])
  const scenario: Scenario = {
    ...SCENARIOS.small,
    locations: [
      place(1, 0, 0),
      place(2, -50, 0),
      place(3, 100, 0),
      place(4, -50, 10),
      place(5, 100, 10),
      place(6, 50, 0),
      place(7, -100, 0),
      place(8, 50, 10),
      place(9, -100, 10),
    ],
    shipments: [shipment(1, 'S1', 60, 2, 3), shipment(2, 'S2', 60, 4, 5), shipment(3, 'S3', 40, 6, 7), shipment(4, 'S4', 40, 8, 9)],
    trucks: [truck(1, 'A', 100, null), truck(2, 'B', 100, null)],
  }

  it('advises a new truck when it saves at least the share in the settings', async () => {
    const { api } = device(scenario)
    const { result } = await solved(api)
    expect(result.trucksUsed).toBe(2)
    const advice = result.extraTruck!
    expect(advice).toMatchObject({ trucksUsed: 3, newTruck: true })
    expect(advice.savingPercent).toBeGreaterThanOrEqual(40)
    expect(advice.savingPercent).toBe(Math.floor(((result.totalMeters - advice.totalMeters) / result.totalMeters) * 100))

    // Above the share in the settings: no advice.
    await api.updateDeviceSettings({ ...DEFAULT_SETTINGS, extraTruckSavingPercent: advice.savingPercent + 1 })
    expect((await solved(api)).result.extraTruck).toBeUndefined()
  })

  it('names one of the available trucks when that is the one more', async () => {
    const three: Scenario = { ...scenario, trucks: [...scenario.trucks, truck(3, 'C', 100, null)] }
    // The comparison is left without the new truck: only the available ones are there.
    const withoutNew: SolverRunner = (input, options) => steps({ ...input, trucks: input.trucks.filter((t) => t.id !== -1) }, options)
    const { api } = device(three, withoutNew)
    const { result } = await solved(api)
    expect(result.extraTruck).toMatchObject({ trucksUsed: 3, newTruck: false })
  })

  it('looks for nothing when switched off, so the job solves once', async () => {
    const calls: number[] = []
    const counted: SolverRunner = (input, options) => {
      calls.push(input.trucks.length)
      return steps(input, options)
    }
    const { api } = device(scenario, counted)
    await api.updateDeviceSettings({ ...DEFAULT_SETTINGS, extraTruckSavingPercent: null })
    expect((await solved(api)).result.extraTruck).toBeUndefined()
    expect(calls).toEqual([2])
  })

  it('plans with up to one more truck at no cost when asked, so the advice can be followed', async () => {
    const three: Scenario = { ...scenario, trucks: [...scenario.trucks, truck(3, 'C', 100, null)] }
    const { api } = device(three)
    expect((await solved(api)).result.trucksUsed).toBe(2)
    const { result } = await solved(api, { ...REQUEST, freeTrucks: 3 })
    expect(result.trucksUsed).toBe(3)
    expect((await rejection(api.createOptimizationJob({ ...REQUEST, freeTrucks: -1 }))).problem.errors).toEqual({
      freeTrucks: 'Broj kamiona mora biti ceo broj, 0 ili veći.',
    })
  })

  it('checks the share in the settings', async () => {
    const { api } = device(scenario)
    for (const bad of [0, 100, 12.5]) {
      const error = await rejection(api.updateDeviceSettings({ ...DEFAULT_SETTINGS, extraTruckSavingPercent: bad }))
      expect(error.problem.errors).toEqual({ extraTruckSavingPercent: 'Unesite ceo broj od 1 do 99 ili ostavite prazno.' })
    }
    expect((await api.updateDeviceSettings({ ...DEFAULT_SETTINGS, extraTruckSavingPercent: 25 })).extraTruckSavingPercent).toBe(25)
  })
})
