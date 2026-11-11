import { describe, expect, it } from 'vitest'
import type { Shipment } from '../../src/api/types'
import type { JobInput } from '../../src/domain/optimization/job'
import { AssignmentError, reassign } from '../../src/domain/optimization/manualAssignment'
import { toOptimizationResult } from '../../src/domain/optimization/result'
import { OPEN_ROUTE_REAR_LOADING } from '../../src/domain/optimization/routePlanner'
import { plannersFor } from '../../src/domain/optimization/solver'
import { toSolverInput } from '../../src/domain/optimization/job'

// Invented: four places on a line 100 km apart, two trucks starting at either end.
const shipment = (id: number, pickup: number, delivery: number, ldmTenths: number, weightKg: number): Shipment => ({
  id,
  externalId: `S-${id}`,
  description: null,
  ldmTenths,
  pickupLocationId: pickup,
  deliveryLocationId: delivery,
  splittable: false,
  weightKg,
  lengthMm: null,
  widthMm: null,
  heightMm: null,
})

const JOB: JobInput = {
  shipments: [shipment(1, 10, 11, 40, 4000), shipment(2, 10, 12, 40, 5000), shipment(3, 13, 12, 40, 6000)],
  trucks: [
    { id: 7, name: 'Prvi', capacityLdmTenths: 136, capacityKg: 24_000, startLocationId: 10 },
    { id: 8, name: 'Drugi', capacityLdmTenths: 80, capacityKg: 12_000, startLocationId: 13 },
  ],
  locationIds: [10, 11, 12, 13],
  distance: [0, 1, 2, 3].map((a) => [0, 1, 2, 3].map((b) => Math.abs(a - b) * 100_000)),
  rules: OPEN_ROUTE_REAR_LOADING,
  allowUnassigned: false,
}

/** S-1 and S-2 on the first truck, S-3 on the second, as planned. */
function planned() {
  const planners = plannersFor(toSolverInput(JOB))
  return toOptimizationResult(JOB, [
    { truckId: 7, route: planners[0].plan([0, 1]) },
    { truckId: 8, route: planners[1].plan([2]) },
  ])
}

const onTruck = (result: ReturnType<typeof planned>, truckId: number) =>
  result.routes.find((r) => r.truckId === truckId)?.stops.filter((s) => s.type === 'PICKUP').map((s) => s.shipmentId) ?? []

describe('reassign', () => {
  it('moves a shipment, plans both trucks again, and the validator agrees', () => {
    const before = planned()
    const after = reassign(JOB, before, 2, 8)
    expect([onTruck(after, 7), onTruck(after, 8).sort()]).toEqual([[1], [2, 3]])
    expect(after.validation).toEqual({ passed: true, violations: [] })
    expect(after.totalMeters).toBe(after.routes.reduce((sum, r) => sum + r.totalMeters, 0))
    // The second truck delivers what it picked up last first (rear loading): S-2 at 12 after S-3 at 12, from 13.
    expect(after.routes.find((r) => r.truckId === 8)!.stops.map((s) => s.type)).toEqual(['PICKUP', 'PICKUP', 'DELIVERY', 'DELIVERY'])
  })

  it('leaves the other trucks exactly as they were', () => {
    const before = planned()
    const third = { ...JOB, trucks: [...JOB.trucks, { id: 9, name: 'Treći', capacityLdmTenths: 136, capacityKg: 24_000, startLocationId: 11 }] }
    const moved = reassign(third, before, 3, 9)
    expect(moved.routes.find((r) => r.truckId === 7)).toEqual(before.routes.find((r) => r.truckId === 7))
    expect(moved.routes.map((r) => r.truckId)).toEqual([7, 9])
  })

  it('takes a shipment off every truck, and puts it back', () => {
    const off = reassign(JOB, planned(), 3, null)
    expect(off.routes.map((r) => r.truckId)).toEqual([7])
    expect(off.unassignedShipmentIds).toEqual([3])
    expect(off.trucksUsed).toBe(1)
    expect(off.validation.passed).toBe(true)

    const back = reassign(JOB, off, 3, 7)
    expect(back.unassignedShipmentIds).toEqual([])
    expect(onTruck(back, 7).sort()).toEqual([1, 2, 3])
    expect(back.validation.passed).toBe(true)
  })

  it('changes nothing when the shipment is on that truck already', () => {
    const before = planned()
    expect(reassign(JOB, before, 1, 7)).toBe(before)
  })

  it('refuses a shipment that does not fit, by LDM or by weight, and says why', () => {
    const full = reassign(JOB, planned(), 2, 8) // the second truck: 8,0 LDM of 8,0
    expect(() => reassign(JOB, full, 1, 8)).toThrow(
      new AssignmentError('doesNotFit', 'Ne staje u Drugi: bilo bi 12,0 LDM, a kamion prima 8,0 LDM.'),
    )
    const light = { ...JOB, trucks: [JOB.trucks[0], { ...JOB.trucks[1], capacityLdmTenths: 136 }] }
    expect(() => reassign(light, reassign(light, planned(), 2, 8), 1, 8)).toThrow(
      'Ne staje u Drugi: bilo bi 15000 kg, a nosivost je 12000 kg.',
    )
  })

  it('names what the job does not have', () => {
    expect(() => reassign(JOB, planned(), 99, 7)).toThrow(new AssignmentError('notFound', 'Pošiljka #99 nije u ovom poslu.'))
    expect(() => reassign(JOB, planned(), 1, 99)).toThrow(new AssignmentError('notFound', 'Kamion #99 nije bio u ovom poslu.'))
  })
})
