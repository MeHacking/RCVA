import { describe, expect, it } from 'vitest'
import type { RoutePlan, Shipment } from '../../src/api/types'
import { STANDARD_TRUCK } from '../../src/domain/fleet'
import { rearLoadedPlan } from '../../src/domain/optimization/loadPlan'
import { readLayoutFile } from '../../src/domain/smartLoadLayout'
import { layoutText } from './layoutFile'

function shipment(id: number, ldmTenths: number, dims: [number, number, number] | null = null): Shipment {
  return {
    id,
    externalId: `S${id}`,
    description: null,
    ldmTenths,
    pickupLocationId: 10 + id,
    deliveryLocationId: 20 + id,
    splittable: false,
    weightKg: 1000,
    lengthMm: dims?.[0] ?? null,
    widthMm: dims?.[1] ?? null,
    heightMm: dims?.[2] ?? null,
  }
}

/** A route with stops in this order; loads and legs do not matter to the load plan. */
function route(pickups: number[], deliveries: number[]): RoutePlan {
  const stops = [
    ...pickups.map((id) => ['PICKUP', id] as const),
    ...deliveries.map((id) => ['DELIVERY', id] as const),
  ].map(([type, shipmentId], i) => ({ sequence: i + 1, type, shipmentId, locationId: 0, loadAfterLdmTenths: 0, legMeters: 0 }))
  return { truckId: 1, usedLdmTenths: 0, totalMeters: 0, stops }
}

const shipments = [shipment(1, 40), shipment(2, 30), shipment(3, 20)]

describe('rearLoadedPlan', () => {
  it('puts what is unloaded first at the doors', () => {
    // Loaded 1, 2, 3 from the rear; unloaded 3, 2, 1.
    const plan = rearLoadedPlan(5, route([1, 2, 3], [3, 2, 1]), STANDARD_TRUCK, shipments)
    expect(plan.mode).toBe('ILLUSTRATIVE_LDM')
    expect(plan.placements.map((p) => [p.shipmentId, p.xMm, p.lengthMm])).toEqual([
      [1, 0, 4000],
      [2, 4000, 3000],
      [3, 7000, 2000],
    ])
    expect(plan.placements.every((p) => p.widthMm === STANDARD_TRUCK.innerWidthMm)).toBe(true)
    expect(plan.warnings).toEqual([])
  })

  it('follows the unloading order, not the loading order', () => {
    const plan = rearLoadedPlan(5, route([1, 2, 3], [2, 1, 3]), STANDARD_TRUCK, shipments)
    // S2 is unloaded first, so it is nearest the doors (largest x); S3 last, at the front wall.
    expect(plan.placements.map((p) => p.shipmentId)).toEqual([3, 1, 2])
    expect(plan.placements.map((p) => p.xMm)).toEqual([0, 2000, 6000])
  })

  it('has one body per shipment (test 8)', () => {
    const plan = rearLoadedPlan(5, route([1, 2, 3], [3, 2, 1]), STANDARD_TRUCK, shipments)
    expect(new Set(plan.placements.map((p) => p.shipmentId)).size).toBe(shipments.length)
  })

  it('uses real boxes when every shipment has dimensions, and warns when they do not fit', () => {
    const boxes = [shipment(1, 40, [8000, 2400, 3000]), shipment(2, 30, [6000, 2600, 2000])]
    const plan = rearLoadedPlan(5, route([1, 2], [2, 1]), STANDARD_TRUCK, boxes)
    expect(plan.mode).toBe('DIMENSIONAL')
    expect(plan.placements.map((p) => [p.shipmentId, p.xMm, p.widthMm, p.heightMm])).toEqual([
      [1, 0, 2400, 2700],
      [2, 8000, 2600, 2000],
    ])
    expect(plan.warnings).toEqual([
      'Pošiljka S2 je šira od tovarnog prostora.',
      'Raspored je duži od tovarnog prostora (14000 mm > 13600 mm).',
    ])
  })
})

describe('rearLoadedPlan with a layout from smartLoad+', () => {
  // 2400 mm long, 7 pieces (one left over), 2,4 LDM.
  const layout = readLayoutFile(layoutText())

  it('puts the pieces where the block stood, and the shipments behind it after its length', () => {
    // S2 has the layout: from the front wall S1 (4000), S2, S3 (2000) at the doors.
    const withLayout = [shipment(1, 40), shipment(2, 24), shipment(3, 20)]
    const plan = rearLoadedPlan(5, route([1, 2, 3], [3, 2, 1]), STANDARD_TRUCK, withLayout, new Map([[2, layout]]))
    const pieces = plan.placements.filter((p) => p.shipmentId === 2)
    expect(pieces).toHaveLength(7)
    expect(pieces.map((p) => p.piece)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(pieces.map((p) => [p.xMm, p.yMm, p.zMm])).toEqual(layout.pieces.map((p) => [4000 + p.xMm, p.yMm, p.zMm]))
    expect(pieces[6]).toMatchObject({ lengthMm: 600, widthMm: 1000, heightMm: 500, rotated: true })
    // S3 starts where the layout ends (4000 + 2400).
    expect(plan.placements.find((p) => p.shipmentId === 3)).toMatchObject({ xMm: 6400, lengthMm: 2000 })
    expect(plan.placements.filter((p) => p.shipmentId !== 2).every((p) => p.piece === undefined)).toBe(true)
    expect(plan.layouts).toEqual([{ shipmentId: 2, name: '2,4 LDM - Proba', pieces: 7 }])
    expect(plan.mode).toBe('ILLUSTRATIVE_LDM')
    expect(plan.warnings).toEqual(['Raspored pošiljke S2 iz smartLoad+ nema sve komade: u smartLoad+ nije stalo 1.'])
  })

  it('takes the occupied length of the layout, and says when the result counted another LDM', () => {
    // The job counted S2 with 3,0 LDM (the layout came later).
    const plan = rearLoadedPlan(5, route([1, 2, 3], [3, 2, 1]), STANDARD_TRUCK, shipments, new Map([[2, layout]]))
    expect(plan.placements.find((p) => p.shipmentId === 3)?.xMm).toBe(4000 + 2400)
    expect(plan.warnings).toContain(
      'Pošiljka S2 je u ovom rezultatu računata sa 3,0 LDM, a po rasporedu iz smartLoad+ zauzima 2,4 LDM; pokrenite optimizaciju ponovo.',
    )
  })

  it('counts as dimensions, and warns when the layout is wider or higher than this truck', () => {
    const boxes = [shipment(1, 40, [4000, 2400, 2000]), shipment(2, 24)]
    const narrow = { innerLengthMm: 13600, innerWidthMm: 2300, innerHeightMm: 1500 }
    const plan = rearLoadedPlan(5, route([1, 2], [2, 1]), narrow, boxes, new Map([[2, layout]]))
    expect(plan.mode).toBe('DIMENSIONAL')
    expect(plan.warnings).toEqual([
      'Pošiljka S1 je šira od tovarnog prostora.',
      'Raspored pošiljke S2 iz smartLoad+ je širi od tovarnog prostora (2400 mm > 2300 mm).',
      'Raspored pošiljke S2 iz smartLoad+ je viši od tovarnog prostora (1600 mm > 1500 mm).',
      'Raspored pošiljke S2 iz smartLoad+ nema sve komade: u smartLoad+ nije stalo 1.',
    ])
  })

  it('leaves a plan without layouts as it was', () => {
    const plan = rearLoadedPlan(5, route([1, 2, 3], [3, 2, 1]), STANDARD_TRUCK, shipments, new Map([[9, layout]]))
    expect(plan).toEqual(rearLoadedPlan(5, route([1, 2, 3], [3, 2, 1]), STANDARD_TRUCK, shipments))
    expect('layouts' in plan).toBe(false)
  })
})
