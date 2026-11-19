import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { readDeviceFile } from '../../src/api/local/deviceFile'
import { createMemoryStore, type DeviceStore } from '../../src/api/local/deviceStore'
import { createLocalApiClient, type LocalData } from '../../src/api/local/localClient'
import { createMockApiClient } from '../../src/api/mock/mockClient'
import { TERMINAL_JOB_STATUSES } from '../../src/api/types'
import type { SolverRunner } from '../../src/domain/optimization/solverRunner'
import { runInThread } from '../../src/domain/optimization/solverRunner'
import { SCENARIOS } from '../../src/fixtures'
import { layoutText } from './layoutFile'

// Layouts from smartLoad+ on the device: kept by shipment, they give it their LDM and weight.

const REQUEST = { timeLimitSeconds: 60, truckIds: null, shipmentIds: null }
const steps: SolverRunner = (input) => runInThread(input, { seed: 1, stepLimit: 3000 })
/** S-101 in the small scenario: 4,0 LDM, 3200 kg. */
const SHIPMENT = 101

function client(store: DeviceStore<LocalData> = createMemoryStore<LocalData>(), runSolver: SolverRunner = steps): ApiClient {
  return createLocalApiClient({ scenario: SCENARIOS.small, runSolver, store })
}

const storedData = (store: { snapshot(): unknown }) => (store.snapshot() as { data: LocalData }).data

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

async function settle(api: ApiClient, id: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (TERMINAL_JOB_STATUSES.includes((await api.getOptimizationJob(id)).status)) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('job did not finish')
}

async function shipment(api: ApiClient, id = SHIPMENT) {
  return (await api.listShipments()).find((s) => s.id === id)
}

describe('layouts from smartLoad+ on the device', () => {
  it('previews what the layout changes, and changes nothing', async () => {
    const store = createMemoryStore<LocalData>()
    const api = client(store)
    const preview = await api.checkShipmentLayout(SHIPMENT, layoutText())
    expect(preview).toMatchObject({
      shipmentId: SHIPMENT,
      before: { ldmTenths: 40, weightKg: 3200 },
      after: { ldmTenths: 24, weightKg: 2140 },
      replaces: null,
    })
    expect(preview.layout.pieces).toHaveLength(7)
    expect(await shipment(api)).toMatchObject({ ldmTenths: 40, weightKg: 3200 })
    expect(storedData(store).shipmentLayouts ?? {}).toEqual({})
  })

  it('gives the shipment the LDM and weight of the layout, and keeps the layout on the device', async () => {
    const store = createMemoryStore<LocalData>()
    const api = client(store)
    const changed = await api.applyShipmentLayout(SHIPMENT, layoutText())
    expect(changed).toMatchObject({ id: SHIPMENT, ldmTenths: 24, weightKg: 2140 })
    expect(await shipment(api)).toMatchObject({ ldmTenths: 24, weightKg: 2140 })
    expect(storedData(store).shipmentLayouts?.[SHIPMENT]?.name).toBe('2,4 LDM - Proba')

    // After a restart, and a second file says what it replaces.
    const again = client(store)
    expect(await shipment(again)).toMatchObject({ ldmTenths: 24 })
    const second = await again.checkShipmentLayout(SHIPMENT, layoutText((f) => (f.name = 'Drugi')))
    expect(second.replaces).toBe('2,4 LDM - Proba')
    expect(second.before).toEqual({ ldmTenths: 24, weightKg: 2140 })
  })

  it('removes a layout and keeps the LDM and weight it gave', async () => {
    const store = createMemoryStore<LocalData>()
    const api = client(store)
    await api.applyShipmentLayout(SHIPMENT, layoutText())
    await api.removeShipmentLayout(SHIPMENT)
    expect(storedData(store).shipmentLayouts).toEqual({})
    expect(await shipment(api)).toMatchObject({ ldmTenths: 24, weightKg: 2140 })
    const none = await rejection(api.removeShipmentLayout(SHIPMENT))
    expect(none.status).toBe(404)
    expect(none.message).toBe('Pošiljka S-101 nema uvezen raspored.')
  })

  it('answers 400 for a bad file and 404 for an unknown shipment, changing nothing', async () => {
    const store = createMemoryStore<LocalData>()
    const api = client(store)
    const bad = await rejection(api.applyShipmentLayout(SHIPMENT, layoutText((f) => (f.units = 'cm'))))
    expect(bad.status).toBe(400)
    expect(bad.problem.title).toBe('Neispravan raspored')
    expect((await rejection(api.checkShipmentLayout(SHIPMENT, '{'))).status).toBe(400)
    expect((await rejection(api.applyShipmentLayout(9999, layoutText()))).status).toBe(404)
    expect((await rejection(api.checkShipmentLayout(9999, layoutText()))).status).toBe(404)
    expect((await rejection(api.removeShipmentLayout(9999))).status).toBe(404)
    expect(await shipment(api)).toMatchObject({ ldmTenths: 40, weightKg: 3200 })
    expect(storedData(store).shipmentLayouts ?? {}).toEqual({})
  })

  it('answers 409 while a job waits or runs', async () => {
    const api = client(undefined, () => new Promise(() => {}))
    await api.applyShipmentLayout(SHIPMENT, layoutText())
    await api.createOptimizationJob(REQUEST)
    const busy = await rejection(api.applyShipmentLayout(SHIPMENT, layoutText((f) => (f.load.lengthMm = 3000))))
    expect(busy.status).toBe(409)
    expect(busy.message).toContain('raspored se može uvesti kada se završi')
    expect((await rejection(api.removeShipmentLayout(SHIPMENT))).status).toBe(409)
    // Looking at a file changes nothing, so it is allowed.
    expect((await api.checkShipmentLayout(SHIPMENT, layoutText())).after.ldmTenths).toBe(24)
    expect(await shipment(api)).toMatchObject({ ldmTenths: 24 })
  })

  it('goes with the shipment: removing one or all removes the layouts', async () => {
    const store = createMemoryStore<LocalData>()
    const api = client(store)
    await api.applyShipmentLayout(SHIPMENT, layoutText())
    await api.applyShipmentLayout(102, layoutText())
    await api.deleteShipment(SHIPMENT)
    expect(Object.keys(storedData(store).shipmentLayouts ?? {})).toEqual(['102'])
    await api.deleteAllShipments()
    expect(storedData(store).shipmentLayouts).toEqual({})
  })

  it('goes into the data file and back, and a layout of no shipment breaks the file', async () => {
    const api = client()
    await api.applyShipmentLayout(SHIPMENT, layoutText())
    const file = await api.exportDeviceData()
    const { data } = readDeviceFile(file!.content)
    expect(data.shipmentLayouts?.[SHIPMENT]?.pieces).toHaveLength(7)

    const other = createMemoryStore<LocalData>()
    const target = client(other)
    await target.replaceDeviceData(file!.content)
    expect(storedData(other).shipmentLayouts?.[SHIPMENT]?.name).toBe('2,4 LDM - Proba')

    const parsed = JSON.parse(file!.content) as { data: { shipmentLayouts: Record<string, unknown> } }
    parsed.data.shipmentLayouts['9999'] = parsed.data.shipmentLayouts[String(SHIPMENT)]
    const broken = await rejection(target.checkDeviceData(JSON.stringify(parsed)))
    expect(broken.message).toContain('raspored iz smartLoad+ je za pošiljku 9999, koja ne postoji')
    delete parsed.data.shipmentLayouts['9999']
    ;(parsed.data.shipmentLayouts[String(SHIPMENT)] as { unplacedPieces: unknown }).unplacedPieces = 'jedan'
    expect((await rejection(target.checkDeviceData(JSON.stringify(parsed)))).message).toContain(
      'fajl.data.shipmentLayouts["101"].unplacedPieces nije ceo broj',
    )
  })

  it('a file without layouts (older) still loads', async () => {
    const api = client()
    const file = await api.exportDeviceData()
    const parsed = JSON.parse(file!.content) as { data: Record<string, unknown> }
    delete parsed.data.shipmentLayouts
    expect((await api.checkDeviceData(JSON.stringify(parsed))).shipments).toBe(SCENARIOS.small.shipments.length)
  })

  it('places the shipment by its layout in the load plans of kept results', async () => {
    const api = client()
    const { id } = await api.createOptimizationJob(REQUEST)
    await settle(api, id)
    const route = (await api.getOptimizationResult(id)).routes.find((r) => r.stops.some((s) => s.shipmentId === SHIPMENT))!
    const before = await api.getLoadPlan(id, route.truckId)
    expect(before.placements.filter((p) => p.shipmentId === SHIPMENT)).toHaveLength(1)

    await api.applyShipmentLayout(SHIPMENT, layoutText())
    const after = await api.getLoadPlan(id, route.truckId)
    expect(after.placements.filter((p) => p.shipmentId === SHIPMENT)).toHaveLength(7)
    expect(after.layouts).toEqual([{ shipmentId: SHIPMENT, name: '2,4 LDM - Proba', pieces: 7 }])
    // The job counted the shipment's earlier 4,0 LDM.
    expect(after.warnings).toContain(
      'Pošiljka S-101 je u ovom rezultatu računata sa 4,0 LDM, a po rasporedu iz smartLoad+ zauzima 2,4 LDM; pokrenite optimizaciju ponovo.',
    )

    // A new job counts the new LDM: no such warning.
    const next = await api.createOptimizationJob(REQUEST)
    await settle(api, next.id)
    const nextRoute = (await api.getOptimizationResult(next.id)).routes.find((r) => r.stops.some((s) => s.shipmentId === SHIPMENT))!
    const plan = await api.getLoadPlan(next.id, nextRoute.truckId)
    expect(plan.placements.filter((p) => p.shipmentId === SHIPMENT)).toHaveLength(7)
    expect(plan.warnings.filter((w) => w.includes('pokrenite optimizaciju ponovo'))).toEqual([])

    await api.removeShipmentLayout(SHIPMENT)
    expect((await api.getLoadPlan(next.id, nextRoute.truckId)).placements.filter((p) => p.shipmentId === SHIPMENT)).toHaveLength(1)
  })

  it('is not in the mock', async () => {
    const mock = createMockApiClient({ scenario: SCENARIOS.small, latencyMs: 0 })
    expect((await rejection(mock.checkShipmentLayout(SHIPMENT, layoutText()))).status).toBe(404)
    expect((await rejection(mock.applyShipmentLayout(SHIPMENT, layoutText()))).status).toBe(404)
    expect((await rejection(mock.removeShipmentLayout(SHIPMENT))).status).toBe(404)
  })
})
