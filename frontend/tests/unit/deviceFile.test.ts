import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { DEVICE_FILE_FORMAT, DEVICE_FILE_VERSION, deviceFileName, readDeviceFile } from '../../src/api/local/deviceFile'
import { createMemoryStore, type DeviceStore } from '../../src/api/local/deviceStore'
import { createLocalApiClient, DEFAULT_SETTINGS, type LocalData } from '../../src/api/local/localClient'
import { createMockApiClient } from '../../src/api/mock/mockClient'
import { TERMINAL_JOB_STATUSES } from '../../src/api/types'
import type { SolverRunner } from '../../src/domain/optimization/solverRunner'
import { runInThread } from '../../src/domain/optimization/solverRunner'
import { SCENARIOS } from '../../src/fixtures'

// Export and import of all data on the device (step 4d). ORS is faked: no request leaves the test.

const REQUEST = { timeLimitSeconds: 60, truckIds: null, shipmentIds: null }
const steps: SolverRunner = (input) => runInThread(input, { seed: 1, stepLimit: 3000 })

/** A fake ORS: the road is 1,2 x the coordinate difference, and a line goes straight through the stops. */
function fakeOrs() {
  const asked: string[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    asked.push(String(input))
    const body = JSON.parse(String(init?.body)) as { coordinates?: number[][]; locations?: number[][]; sources: number[]; destinations: number[] }
    if (body.coordinates) {
      return new Response(JSON.stringify({ features: [{ geometry: { type: 'LineString', coordinates: body.coordinates } }] }))
    }
    const at = body.locations as number[][]
    const distances = body.sources.map((s) =>
      body.destinations.map((d) => Math.round(120_000 * (Math.abs(at[s][0] - at[d][0]) + Math.abs(at[s][1] - at[d][1])))),
    )
    return new Response(JSON.stringify({ distances }))
  }) as typeof globalThis.fetch
  return { fetch, asked }
}

function client(store: DeviceStore<LocalData>, ors = fakeOrs(), runSolver: SolverRunner = steps): ApiClient {
  return createLocalApiClient({ scenario: SCENARIOS.small, runSolver, store, ors: { fetch: ors.fetch, minIntervalMs: 0 } })
}

const storedData = (store: { snapshot(): unknown }) => (store.snapshot() as { data: LocalData }).data

async function settle(api: ApiClient, id: number) {
  for (let i = 0; i < 100; i++) {
    const job = await api.getOptimizationJob(id)
    if (TERMINAL_JOB_STATUSES.includes(job.status)) return job
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('job did not finish')
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

/** A device with everything a file carries: a new truck where it is, a job on road distances, a road line, a key. */
async function usedDevice(key = 'kljuc-uredjaja-a') {
  const store = createMemoryStore<LocalData>()
  const api = client(store)
  await api.updateDeviceSettings({ ...DEFAULT_SETTINGS, orsApiKey: key, contactEmail: 'dispecer@example.com' })
  const truck = await api.createTruck({
    name: 'Izvozna cerada',
    capacityLdmTenths: 136,
    capacityKg: 24_000,
    available: true,
    innerLengthMm: 13_600,
    innerWidthMm: 2480,
    innerHeightMm: 2700,
  })
  // A place the device knows: no lookup.
  await api.setTruckStart(truck.id, { place: { name: 'Subotica', postalCode: null, country: 'RS' } })
  const { id } = await api.createOptimizationJob(REQUEST)
  expect((await settle(api, id)).status).toBe('COMPLETED')
  const result = await api.getOptimizationResult(id)
  await api.getRouteLine(id, result.routes[0].truckId)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { store, api, jobId: id, result }
}

async function exported(api: ApiClient): Promise<string> {
  const file = await api.exportDeviceData()
  expect(file).not.toBeNull()
  return file!.content
}

describe('data file of the device', () => {
  it('holds everything the device keeps but the ORS key, and reads back as it was', async () => {
    const { store, api } = await usedDevice()
    const content = await exported(api)

    expect(content).not.toContain('kljuc-uredjaja-a')
    const file = JSON.parse(content) as { format: string; version: number; data: { settings: object; trucks: object[] } }
    expect([file.format, file.version]).toEqual([DEVICE_FILE_FORMAT, DEVICE_FILE_VERSION])
    expect(file.data.settings).toEqual({
      geocodingEnabled: true,
      contactEmail: 'dispecer@example.com',
      orsProfile: 'driving-hgv',
      extraTruckSavingPercent: 10,
    })
    // Where the new truck is travels with it.
    expect(file.data.trucks.at(-1)).toMatchObject({ name: 'Izvozna cerada', startLocationId: 2 })

    // The fleet (a Map), the added trucks (a Set) and payloads without a limit (Infinity) come back.
    const stored = storedData(store)
    const { data, summary } = readDeviceFile(content)
    expect(data).toEqual({ ...stored, settings: { ...stored.settings, orsApiKey: null } })
    expect(data.jobs[0].fleet).toBeInstanceOf(Map)
    expect(data.jobs[0].input.trucks.some((t) => t.capacityKg === Infinity)).toBe(true)
    expect(summary).toMatchObject({
      shipments: stored.shipments.length,
      locations: stored.locations.length,
      trucks: 4,
      results: 1,
      distances: Object.keys(stored.distanceCache ?? {}).length,
      routeLines: 1,
    })
    expect(summary.distances).toBeGreaterThan(0)
  })

  it('is named after the local date', () => {
    expect(deviceFileName(new Date(2026, 10, 1, 23, 59))).toBe('rcva-2026-11-01.json')
  })

  it('refuses every broken file with the reason', async () => {
    const { api } = await usedDevice()
    const content = await exported(api)
    type File = { format: unknown; version: unknown; data: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
    const changed = (change: (file: File) => void) => {
      const file = JSON.parse(content) as File
      change(file)
      return JSON.stringify(file)
    }
    const broken = 'Fajl je oštećen ili izmenjen: '
    const cases: Array<[string, string | RegExp]> = [
      ['nije json', 'Fajl nije JSON; izaberite fajl koji je napravilo „Izvezi podatke“.'],
      ['[1, 2]', 'Ovo nije fajl sa podacima aplikacije RCVA; izaberite fajl koji je napravilo „Izvezi podatke“.'],
      [changed((f) => (f.format = 'drugo')), 'Ovo nije fajl sa podacima aplikacije RCVA; izaberite fajl koji je napravilo „Izvezi podatke“.'],
      [changed((f) => (f.version = 2)), 'Fajl je u formatu 2, a aplikacija zna samo format 1; možda ga je napravila novija verzija aplikacije.'],
      [changed((f) => (f.data.shipments[0].ldmTenths = 2.5)), `${broken}fajl.data.shipments[0].ldmTenths nije ceo broj.`],
      [changed((f) => delete f.data.trucks), `${broken}fajl.data.trucks nije spisak.`],
      [changed((f) => (f.data.locations[1].lat = '45')), `${broken}fajl.data.locations[1].lat nije broj.`],
      [changed((f) => (f.data.jobs[0].status = 'GOTOVO')), `${broken}fajl.data.jobs[0].status nije jedno od: QUEUED, RUNNING, COMPLETED, INFEASIBLE, CANCELLED, FAILED.`],
      [changed((f) => (f.data.jobs[0].result.routes[0].stops[0].type = 'UTOVAR')), `${broken}fajl.data.jobs[0].result.routes[0].stops[0].type nije jedno od: PICKUP, DELIVERY.`],
      [changed((f) => (f.data.geocodeCache['proba|rs'] = { found: true, lat: 45 })), `${broken}fajl.data.geocodeCache["proba|rs"] nije zapamćena koordinata.`],
      [changed((f) => (f.data.distanceCache.x = 'daleko')), `${broken}fajl.data.distanceCache["x"] nije broj.`],
      [changed((f) => (Object.values(f.data.routeLineCache)[0] as number[][]).push([45, 20, 0])), /^Fajl je oštećen ili izmenjen: fajl\.data\.routeLineCache\["driving-hgv\|.+"\]\[\d+\] nije tačka \[lat, lon\]\.$/],
      [changed((f) => (f.data.shipments[0].pickupLocationId = 999)), `${broken}pošiljka ${SCENARIOS.small.shipments[0].externalId} vodi do mesta 999, koje ne postoji.`],
      [changed((f) => (f.data.trucks[1].id = f.data.trucks[0].id)), `${broken}kamion ${SCENARIOS.small.trucks[0].id} se ponavlja.`],
      [changed((f) => f.data.jobs[0].input.distance.pop()), `${broken}rastojanja posla 1 ne odgovaraju njegovim mestima.`],
      [changed((f) => (f.data.jobs[0].result = null)), `${broken}završeni posao 1 nema rezultat.`],
      [changed((f) => (f.data.nextTruckId = 1)), `${broken}brojač id-jeva je manji od postojećeg id-ja.`],
      [changed((f) => (f.data.nextJobId = 1)), `${broken}brojač id-jeva je manji od postojećeg id-ja.`],
      [changed((f) => (f.data.trucks.at(-1).startLocationId = 999)), `${broken}kamion „Izvozna cerada“ je na mestu 999, koje ne postoji.`],
      [changed((f) => (f.data.trucks[0].startLocationId = 'Beograd')), `${broken}fajl.data.trucks[0].startLocationId nije ceo broj.`],
      [changed((f) => (f.data.settings.extraTruckSavingPercent = '10')), `${broken}fajl.data.settings.extraTruckSavingPercent nije ceo broj.`],
      [changed((f) => (f.data.jobs[0].input.freeTrucks = -0.5)), `${broken}fajl.data.jobs[0].input.freeTrucks nije ceo broj.`],
    ]
    for (const [text, message] of cases) {
      const error = await rejection(api.checkDeviceData(text))
      expect(error.problem.title).toBe('Neispravan fajl')
      expect(error.status).toBe(400)
      if (message instanceof RegExp) expect(error.message).toMatch(message)
      else expect(error.message).toBe(message)
    }
  })
})

describe('replacing the data on the device with a file', () => {
  it('takes over everything from the file and keeps the key of the device', async () => {
    const a = await usedDevice()
    const content = await exported(a.api)

    const store = createMemoryStore<LocalData>()
    const ors = fakeOrs()
    const b = client(store, ors)
    await b.updateDeviceSettings({ ...DEFAULT_SETTINGS, orsApiKey: 'kljuc-uredjaja-b' })
    await b.deleteTruck(1)
    const before = await b.listTrucks()

    // Checking changes nothing.
    expect((await b.checkDeviceData(content)).trucks).toBe(4)
    expect(await b.listTrucks()).toEqual(before)

    const summary = await b.replaceDeviceData(content)
    expect(summary.results).toBe(1)
    expect(await b.listTrucks()).toEqual(await a.api.listTrucks())
    expect(await b.listShipments()).toEqual(await a.api.listShipments())
    expect(await b.getLatestOptimizationJob()).toEqual(await a.api.getLatestOptimizationJob())
    expect(await b.getOptimizationResult(a.jobId)).toEqual(a.result)
    const truckId = a.result.routes[0].truckId
    expect(await b.getLoadPlan(a.jobId, truckId)).toEqual(await a.api.getLoadPlan(a.jobId, truckId))
    expect(await b.getDeviceSettings()).toEqual({
      geocodingEnabled: true,
      contactEmail: 'dispecer@example.com',
      orsApiKey: 'kljuc-uredjaja-b',
      orsProfile: 'driving-hgv',
      extraTruckSavingPercent: 10,
    })
    // The road line and the distances came with the file: nothing is asked again.
    expect(await b.getRouteLine(a.jobId, truckId)).toEqual(await a.api.getRouteLine(a.jobId, truckId))
    const { id } = await b.createOptimizationJob(REQUEST)
    expect((await settle(b, id)).status).toBe('COMPLETED')
    expect(ors.asked).toEqual([])

    // Stored: a restart shows the imported data.
    expect(await client(store).listTrucks()).toEqual(await a.api.listTrucks())
  })

  it('changes nothing and stores nothing for a bad file', async () => {
    const store = createMemoryStore<LocalData>()
    const api = client(store)
    const before = await api.listTrucks()
    const snapshot = store.snapshot()
    expect((await rejection(api.replaceDeviceData('{"format":"rcva-podaci","version":1}'))).status).toBe(400)
    expect(await api.listTrucks()).toEqual(before)
    expect(store.snapshot()).toEqual(snapshot)
  })

  it('answers 409 while a job runs, and brings back a job that ran when the file was made as failed', async () => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const api = client(createMemoryStore<LocalData>(), fakeOrs(), (input, options) => held.then(() => steps(input, options)))
    const { id } = await api.createOptimizationJob(REQUEST)
    const content = await exported(api)
    const error = await rejection(api.replaceDeviceData(content))
    expect(error.problem).toMatchObject({ status: 409, detail: `Optimizacija #${id} je u toku; podaci se mogu uvesti kada se završi.` })
    release()
    await settle(api, id)

    const other = client(createMemoryStore<LocalData>())
    await other.replaceDeviceData(content)
    expect((await other.getOptimizationJob(id)).status).toBe('FAILED')
  })

  it('is not there in the mock', async () => {
    const mock = createMockApiClient({ scenario: SCENARIOS.small })
    expect(await mock.exportDeviceData()).toBeNull()
    expect((await rejection(mock.checkDeviceData('{}'))).status).toBe(404)
    expect((await rejection(mock.replaceDeviceData('{}'))).status).toBe(404)
  })
})
