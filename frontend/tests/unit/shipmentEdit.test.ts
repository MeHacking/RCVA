import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { createMemoryStore, type DeviceStore } from '../../src/api/local/deviceStore'
import { createLocalApiClient, EMPTY_START, type LocalApiOptions, type LocalData } from '../../src/api/local/localClient'
import { createMockApiClient } from '../../src/api/mock/mockClient'
import { TERMINAL_JOB_STATUSES, type Shipment } from '../../src/api/types'
import { runInThread, type SolverRunner } from '../../src/domain/optimization/solverRunner'
import { SCENARIOS } from '../../src/fixtures'

// Corrections of imported shipments (NOT IN SPEC v2). Nominatim is faked: it knows only
// these invented places, so Losestad stays without coordinates after the import.
const COORDINATES: Record<string, { lat: string; lon: string }> = {
  Primerovo: { lat: '45.1', lon: '20.1' },
  Drugovo: { lat: '44.5', lon: '20.6' },
  Teststad: { lat: '57.1', lon: '12.1' },
  Novostad: { lat: '58.2', lon: '13.3' },
}
const ROWS = [
  ['RELACIJA', 'TEŽINA', 'DIMENZIJE'],
  ['PRIMEROVO - LOSESTAD 11111', '1,200 kg', '2,4m'],
  ['DRUGOVO - LOSESTAD 11111', '800 kg', '1,2m'],
  ['PRIMEROVO - TESTSTAD 22222', '500 kg', '1m'],
]
const MAPPING = { sheetName: 'Sheet1', headerRow: 1, columns: { relation: 0, weight: 1, ldm: 2 } }
const REQUEST = { timeLimitSeconds: 60, truckIds: null, shipmentIds: null }
const steps: SolverRunner = (input) => runInThread(input, { seed: 1, stepLimit: 3000 })

function nominatim() {
  const fake = {
    down: false,
    asked: [] as string[],
    fetch: (async (input: RequestInfo | URL) => {
      const q = new URL(String(input)).searchParams.get('q') ?? ''
      fake.asked.push(q)
      if (fake.down) throw new TypeError('Failed to fetch')
      const place = COORDINATES[q]
      return new Response(JSON.stringify(place ? [{ ...place, display_name: q }] : []))
    }) as typeof fetch,
  }
  return fake
}

function device(
  fake: ReturnType<typeof nominatim>,
  store: DeviceStore<LocalData> = createMemoryStore<LocalData>(),
  scenario: LocalApiOptions['scenario'] = EMPTY_START,
  runSolver: SolverRunner = steps,
): ApiClient {
  return createLocalApiClient({
    scenario,
    runSolver,
    store,
    readWorkbook: async () => [{ sheet: 'Sheet1', data: ROWS }],
    nominatim: { fetch: fake.fetch, minIntervalMs: 0 },
  })
}

/** The device after the import of ROWS: Nedelja-2 and Nedelja-3 are delivered to Losestad, which has no coordinates. */
async function imported(store?: DeviceStore<LocalData>) {
  const fake = nominatim()
  const api = device(fake, store)
  const { importId } = await api.createImport(new File(['fake'], 'Nedelja.xlsx'))
  await api.setImportMapping(importId, MAPPING)
  await api.commitImport(importId)
  expect(fake.asked).toEqual(['Primerovo', 'Losestad', 'Drugovo', 'Teststad'])
  fake.asked.length = 0
  const shipments = await api.listShipments()
  const byId = (externalId: string) => shipments.find((s) => s.externalId === externalId) as Shipment
  return { api, fake, first: byId('Nedelja-2'), second: byId('Nedelja-3'), third: byId('Nedelja-4') }
}

async function placeOf(api: ApiClient, externalId: string, role: 'pickup' | 'delivery') {
  const shipment = (await api.listShipments()).find((s) => s.externalId === externalId) as Shipment
  const id = role === 'pickup' ? shipment.pickupLocationId : shipment.deliveryLocationId
  return (await api.listLocations()).find((l) => l.id === id)
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

const storedData = (store: { snapshot(): unknown }) => (store.snapshot() as { data: LocalData }).data

describe('correcting a shipment on the device', () => {
  it('looks up only the new place, once, and moves the other shipments at the unclear place', async () => {
    const store = createMemoryStore<LocalData>()
    const { api, fake, first } = await imported(store)
    const result = await api.updateShipment(first.id, {
      delivery: { name: 'Novostad', postalCode: '11111', country: null, moveOtherShipments: true },
    })

    expect(fake.asked).toEqual(['Novostad'])
    expect(result.movedShipments).toBe(1)
    expect(result.places).toEqual([
      { role: 'pickup', name: 'Primerovo', outcome: 'known', message: null },
      { role: 'delivery', name: 'Novostad', outcome: 'found', message: null },
    ])
    const novostad = { name: 'Novostad', postalCode: '11111', lat: 58.2, lon: 13.3, geocodeStatus: 'MANUAL' }
    expect(await placeOf(api, 'Nedelja-2', 'delivery')).toMatchObject(novostad)
    expect(await placeOf(api, 'Nedelja-3', 'delivery')).toMatchObject(novostad)
    // Losestad is used by nothing any more, and it is stored that way.
    expect((await api.listLocations()).map((l) => l.name).sort()).toEqual(['Drugovo', 'Novostad', 'Primerovo', 'Teststad'])
    expect(storedData(store).locations.map((l) => l.name)).not.toContain('Losestad')
    expect(storedData(store).shipments.find((s) => s.id === first.id)?.deliveryLocationId).toBe(result.shipment.deliveryLocationId)
  })

  it('moves only the edited shipment when the others are not asked for', async () => {
    const { api, first } = await imported()
    const result = await api.updateShipment(first.id, { delivery: { name: 'Novostad', postalCode: '11111', country: null } })
    expect(result.movedShipments).toBe(0)
    expect(await placeOf(api, 'Nedelja-2', 'delivery')).toMatchObject({ name: 'Novostad' })
    expect(await placeOf(api, 'Nedelja-3', 'delivery')).toMatchObject({ name: 'Losestad', lat: null, geocodeStatus: 'FAILED' })
  })

  it('never moves the other shipments away from a place with coordinates', async () => {
    const { api, third } = await imported()
    const result = await api.updateShipment(third.id, {
      pickup: { name: 'Drugovo', postalCode: null, country: null, moveOtherShipments: true },
    })
    expect(result.movedShipments).toBe(0)
    expect(await placeOf(api, 'Nedelja-2', 'pickup')).toMatchObject({ name: 'Primerovo' })
    expect(await placeOf(api, 'Nedelja-4', 'pickup')).toMatchObject({ name: 'Drugovo' })
  })

  it('asks nothing for a known place, nor for an answer kept from before', async () => {
    const { api, fake, first, second } = await imported()
    // Known by its name alone: the number next to a place is not compared.
    const known = await api.updateShipment(second.id, { delivery: { name: 'teststad', postalCode: null, country: null } })
    expect(known.places[1]).toEqual({ role: 'delivery', name: 'teststad', outcome: 'known', message: null })
    expect(await placeOf(api, 'Nedelja-3', 'delivery')).toMatchObject({ name: 'Teststad', postalCode: '22222' })

    // An unchanged shipment looks up its unclear place again, but Nominatim's "not found" is kept.
    const again = await api.updateShipment(first.id, {})
    expect(again.places[1]).toEqual({ role: 'delivery', name: 'Losestad', outcome: 'notFound', message: null })
    expect(fake.asked).toEqual([])
  })

  it('keeps the shipment when Nominatim does not answer, and asks again on the next save', async () => {
    const { api, fake, first } = await imported()
    fake.down = true
    const failed = await api.updateShipment(first.id, { delivery: { name: 'Novostad', postalCode: '11111', country: null } })
    expect(failed.places[1]).toMatchObject({ outcome: 'failed', message: expect.stringContaining('Nominatim nije dostupan') })
    expect(await placeOf(api, 'Nedelja-2', 'delivery')).toMatchObject({ name: 'Novostad', lat: null, geocodeStatus: 'FAILED' })

    fake.down = false
    const found = await api.updateShipment(first.id, {})
    expect(found.places[1].outcome).toBe('found')
    expect(fake.asked).toEqual(['Novostad', 'Novostad'])
    expect(await placeOf(api, 'Nedelja-2', 'delivery')).toMatchObject({ name: 'Novostad', lat: 58.2, lon: 13.3 })
  })

  it('asks nothing when the lookup is switched off in the settings', async () => {
    const { api, fake, first } = await imported()
    await api.updateDeviceSettings({ ...(await api.getDeviceSettings())!, geocodingEnabled: false })
    const result = await api.updateShipment(first.id, { delivery: { name: 'Novostad', postalCode: '11111', country: null } })
    expect(result.places[1]).toMatchObject({ outcome: 'failed', message: 'Traženje koordinata je isključeno u podešavanjima.' })
    expect(fake.asked).toEqual([])
  })

  it('takes coordinates by hand for a place without them, for every shipment there, without a lookup', async () => {
    const store = createMemoryStore<LocalData>()
    const { api, fake, first } = await imported(store)
    const before = await placeOf(api, 'Nedelja-2', 'delivery')
    const result = await api.updateShipment(first.id, {
      delivery: { name: 'Losestad', postalCode: '11111', country: 'SE', coordinates: { lat: 59.1, lon: 15.2 } },
    })
    expect(fake.asked).toEqual([])
    expect(result.places[1]).toEqual({ role: 'delivery', name: 'Losestad', outcome: 'manual', message: null })
    const losestad = { id: before?.id, country: 'SE', lat: 59.1, lon: 15.2, geocodeStatus: 'MANUAL' }
    expect(await placeOf(api, 'Nedelja-2', 'delivery')).toMatchObject(losestad)
    expect(await placeOf(api, 'Nedelja-3', 'delivery')).toMatchObject(losestad)

    // After a restart the device still has them.
    const restarted = device(nominatim(), store)
    expect(await placeOf(restarted, 'Nedelja-3', 'delivery')).toMatchObject(losestad)
  })

  it('answers 400 by field and changes nothing, asking nothing', async () => {
    const store = createMemoryStore<LocalData>()
    const { api, fake, first, second } = await imported(store)
    const before = structuredClone(storedData(store))
    const cases: [Parameters<ApiClient['updateShipment']>[1], Record<string, string>][] = [
      [{ externalId: ' ' }, { externalId: 'Unesite ID pošiljke.' }],
      [{ externalId: second.externalId }, { externalId: 'ID „Nedelja-3“ već postoji među pošiljkama.' }],
      [{ ldmTenths: 0 }, { ldmTenths: 'LDM mora biti veći od 0, sa najviše jednom decimalom.' }],
      [{ ldmTenths: 2.5 }, { ldmTenths: 'LDM mora biti veći od 0, sa najviše jednom decimalom.' }],
      [{ weightKg: -1 }, { weightKg: 'Težina mora biti veća od 0 ili prazna.' }],
      [{ pickup: { name: ' ', postalCode: null, country: null } }, { pickup: 'Unesite mesto preuzimanja.' }],
      [
        { delivery: { name: 'Novostad', postalCode: null, country: null, coordinates: { lat: 91, lon: 0 } } },
        { deliveryCoordinates: 'Geografska širina mora biti između -90 i 90, a dužina između -180 i 180.' },
      ],
      [
        { pickup: { name: 'Primerovo', postalCode: null, country: null, coordinates: { lat: 1, lon: 2 } } },
        { pickupCoordinates: 'Mesto „Primerovo“ već ima koordinate; ručno se unose samo za mesto bez njih.' },
      ],
    ]
    // Every patch also has a new place that would be looked up if the patch were accepted.
    const novostad = { name: 'Novostad', postalCode: '11111', country: null }
    for (const [patch, errors] of cases) {
      const error = await rejection(api.updateShipment(first.id, { delivery: novostad, ...patch }))
      expect(error.problem).toMatchObject({ status: 400, errors })
    }
    expect(fake.asked).toEqual([])
    expect(storedData(store)).toEqual(before)
    expect((await rejection(api.updateShipment(999, {}))).status).toBe(404)
  })

  it('changes the other fields and keeps them after a restart', async () => {
    const store = createMemoryStore<LocalData>()
    const { api, first } = await imported(store)
    await api.updateShipment(first.id, { externalId: ' N-1 ', ldmTenths: 33, weightKg: null, description: ' Palete ' })
    const restarted = device(nominatim(), store)
    expect((await restarted.listShipments()).find((s) => s.id === first.id)).toMatchObject({
      externalId: 'N-1',
      ldmTenths: 33,
      weightKg: null,
      description: 'Palete',
    })
  })

  it('leaves kept results as they were: their places keep name and coordinates', async () => {
    const fake = nominatim()
    const api = device(fake, createMemoryStore<LocalData>(), SCENARIOS.small)
    const { id } = await api.createOptimizationJob(REQUEST)
    await settled(api, id)
    const result = await api.getOptimizationResult(id)
    const subotica = (await api.listLocations()).find((l) => l.name === 'Subotica')

    await api.updateShipment(101, { pickup: { name: 'Primerovo', postalCode: null, country: 'RS' } })
    expect(await placeOf(api, 'S-101', 'pickup')).toMatchObject({ name: 'Primerovo', lat: 45.1, geocodeStatus: 'MANUAL' })
    // Subotica is no shipment's place any more, but the result still names it.
    expect((await api.listLocations()).find((l) => l.name === 'Subotica')).toEqual(subotica)
    expect(await api.getOptimizationResult(id)).toEqual(result)
  })

  it('answers 409 while a job runs', async () => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const fake = nominatim()
    const api = device(fake, createMemoryStore<LocalData>(), SCENARIOS.small, (input, options) =>
      held.then(() => steps(input, options)),
    )
    const { id } = await api.createOptimizationJob(REQUEST)
    const error = await rejection(
      api.updateShipment(101, { ldmTenths: 10, delivery: { name: 'Novostad', postalCode: null, country: null } }),
    )
    expect(error.problem).toMatchObject({ status: 409, detail: `Optimizacija #${id} je u toku; pošiljke se mogu menjati kada se završi.` })
    expect((await api.listShipments()).find((s) => s.id === 101)?.ldmTenths).toBe(40)
    // Refused before the lookup: nothing is asked for a change that cannot be made.
    expect(fake.asked).toEqual([])
    release()
    await settled(api, id)
  })
})

describe('correcting a shipment in the mock', () => {
  it('looks the new place up in the probni spisak and keeps every place', async () => {
    const api = createMockApiClient({ scenario: SCENARIOS.small, latencyMs: 0 })
    const unknown = await api.updateShipment(101, { delivery: { name: 'Nepoznatovo', postalCode: null, country: 'SE' } })
    expect(unknown.places[1]).toMatchObject({ name: 'Nepoznatovo', outcome: 'notFound' })
    const found = await api.updateShipment(101, { delivery: { name: 'Malmö', postalCode: null, country: 'SE' } })
    expect(found.places[1]).toMatchObject({ name: 'Malmö', outcome: 'found' })
    // Ljungby (the old place) and Nepoznatovo stay: the scenario's fixed result names its places.
    expect((await api.listLocations()).map((l) => l.name)).toEqual(expect.arrayContaining(['Ljungby', 'Nepoznatovo', 'Malmö']))
  })
})

async function settled(api: ApiClient, id: number) {
  for (let i = 0; i < 100; i++) {
    const job = await api.getOptimizationJob(id)
    if (TERMINAL_JOB_STATUSES.includes(job.status)) return job
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('job did not finish')
}
