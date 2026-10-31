import { describe, expect, it } from 'vitest'
import type { RoutePlan, Shipment } from '../../src/api/types'
import { STANDARD_TRUCK } from '../../src/domain/fleet'
import { rearLoadedPlan } from '../../src/domain/optimization/loadPlan'

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
