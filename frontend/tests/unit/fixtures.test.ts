import { describe, expect, it } from 'vitest'
import { formatKm } from '../../src/format/units'
import { SCENARIOS } from '../../src/fixtures'
import { trucksLowerBound } from '../../src/domain/capacity'

describe('test 7 fixture (specification v2, section 10)', () => {
  const { outcome } = SCENARIOS.test7
  if (outcome.kind !== 'COMPLETED') throw new Error('test7 must be COMPLETED')
  const { result } = outcome

  it('uses 2 trucks and 1001489 m, displayed as 1001,5 km', () => {
    expect(result.trucksUsed).toBe(2)
    expect(result.trucksLowerBound).toBe(2)
    expect(result.totalMeters).toBe(1001489)
    expect(formatKm(result.totalMeters)).toBe('1001,5 km')
  })

  it('pairs S1+S3 (500,0 km) and S2+S4', () => {
    expect(result.routes.map((r) => r.stops.filter((s) => s.type === 'PICKUP').map((s) => s.shipmentId))).toEqual([
      [71, 73],
      [72, 74],
    ])
    expect(result.routes[0].totalMeters).toBe(500000)
  })
})

describe('trucksLowerBound', () => {
  it('matches the specification examples', () => {
    expect(trucksLowerBound(SCENARIOS.small.shipments, SCENARIOS.small.trucks)).toBe(2)
    expect(trucksLowerBound(SCENARIOS.notFound.shipments, SCENARIOS.notFound.trucks)).toBe(2)
  })
})

// Internal consistency of every COMPLETED fixture, with the same rules as the
// specification's SolutionValidator, so the fixtures' "validation passed" is not a bluff.
const completed = Object.values(SCENARIOS).flatMap((scenario) =>
  scenario.outcome.kind === 'COMPLETED' ? [{ ...scenario, result: scenario.outcome.result }] : [],
)

describe.each(completed)('fixture $name', (scenario) => {
  const { result } = scenario
  const shipments = new Map(scenario.shipments.map((s) => [s.id, s]))
  const trucks = new Map(scenario.trucks.map((t) => [t.id, t]))

  it('assigns every shipment exactly once (pickup and delivery on the same truck)', () => {
    const pickups = result.routes.flatMap((r) => r.stops.filter((s) => s.type === 'PICKUP').map((s) => s.shipmentId))
    const deliveries = result.routes.flatMap((r) =>
      r.stops.filter((s) => s.type === 'DELIVERY').map((s) => s.shipmentId),
    )
    expect(new Set(pickups).size).toBe(pickups.length)
    expect([...pickups].sort()).toEqual([...deliveries].sort())
    expect([...pickups, ...result.unassignedShipmentIds].sort()).toEqual([...shipments.keys()].sort())
    for (const route of result.routes) {
      const ids = (type: string) => route.stops.filter((s) => s.type === type).map((s) => s.shipmentId).sort()
      expect(ids('PICKUP')).toEqual(ids('DELIVERY'))
    }
  })

  it('keeps two phases, capacity and consistent loads and totals', () => {
    for (const route of result.routes) {
      const truck = trucks.get(route.truckId)
      expect(truck?.available).toBe(true)
      const firstDelivery = route.stops.findIndex((s) => s.type === 'DELIVERY')
      expect(route.stops.slice(firstDelivery).every((s) => s.type === 'DELIVERY')).toBe(true)

      const total = route.stops
        .filter((s) => s.type === 'PICKUP')
        .reduce((sum, s) => sum + (shipments.get(s.shipmentId)?.ldmTenths ?? NaN), 0)
      expect(route.usedLdmTenths).toBe(total)
      expect(total).toBeLessThanOrEqual(truck?.capacityLdmTenths ?? 0)
      expect(route.stops.at(-1)?.loadAfterLdmTenths).toBe(0)
      expect(route.stops.map((s) => s.sequence)).toEqual(route.stops.map((_, i) => i + 1))

      const legs = route.stops.reduce((sum, s) => sum + s.legMeters, 0)
      expect(route.totalMeters).toBeGreaterThanOrEqual(legs) // the difference is the return leg
    }
    expect(result.totalMeters).toBe(result.routes.reduce((sum, r) => sum + r.totalMeters, 0))
    expect(result.trucksUsed).toBe(result.routes.length)
    expect(result.trucksUsed).toBeGreaterThanOrEqual(result.trucksLowerBound)
  })
})
