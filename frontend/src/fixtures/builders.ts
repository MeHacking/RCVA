import type { OptimizationResult, RoutePlan, Shipment, StopType, Truck } from '../api/types'

/** Distance in whole metres between two locations */
export type DistanceFn = (fromLocationId: number, toLocationId: number) => number

export interface RouteSpec {
  truckId: number
  stops: ReadonlyArray<readonly [StopType, number]>
}

/** Straight-line distance for planar coordinates given in km (used by test 7). */
export function planarDistance(coordinatesKm: Record<number, readonly [number, number]>): DistanceFn {
  return (from, to) => {
    const [x1, y1] = coordinatesKm[from]
    const [x2, y2] = coordinatesKm[to]
    return Math.round(Math.hypot(x2 - x1, y2 - y1) * 1000)
  }
}

/** Great-circle distance from lat/lon; a mock stand-in for OSRM road distances. */
export function haversineDistance(latLon: Record<number, readonly [number, number]>): DistanceFn {
  const R_KM = 6371
  const rad = (deg: number) => (deg * Math.PI) / 180
  return (from, to) => {
    const [lat1, lon1] = latLon[from]
    const [lat2, lon2] = latLon[to]
    const a =
      Math.sin(rad(lat2 - lat1) / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
    return Math.round(2 * R_KM * Math.asin(Math.sqrt(a)) * 1000)
  }
}

/**
 * Lower bound on trucks (valid with two phases per route): the smallest k for which
 * the k largest available capacities cover the total LDM. null if the whole fleet is not enough.
 */
export function trucksLowerBound(shipments: Shipment[], trucks: Truck[]): number | null {
  const total = shipments.reduce((sum, s) => sum + s.ldmTenths, 0)
  const capacities = trucks
    .filter((t) => t.available)
    .map((t) => t.capacityLdmTenths)
    .sort((a, b) => b - a)
  let covered = 0
  for (let k = 0; k < capacities.length; k++) {
    if (covered >= total) return k
    covered += capacities[k]
  }
  return covered >= total ? capacities.length : null
}

/**
 * Builds a COMPLETED result from a fixed stop order. Legs, loads and totals are derived,
 * so a fixture cannot contain inconsistent numbers. Not a solver: the order is given.
 */
export function buildCompletedResult(params: {
  shipments: Shipment[]
  trucks: Truck[]
  baseLocationId: number
  routes: RouteSpec[]
  distance: DistanceFn
}): OptimizationResult {
  const { shipments, trucks, baseLocationId, routes, distance } = params
  const byId = new Map(shipments.map((s) => [s.id, s]))

  const plans: RoutePlan[] = routes.map((route) => {
    let previousLocationId = baseLocationId
    let load = 0
    let usedLdmTenths = 0
    const stops = route.stops.map(([type, shipmentId], index) => {
      const shipment = byId.get(shipmentId)
      if (!shipment) throw new Error(`Unknown shipment ${shipmentId} in fixture route`)
      const locationId = type === 'PICKUP' ? shipment.pickupLocationId : shipment.deliveryLocationId
      load += type === 'PICKUP' ? shipment.ldmTenths : -shipment.ldmTenths
      usedLdmTenths = Math.max(usedLdmTenths, load)
      const legMeters = distance(previousLocationId, locationId)
      previousLocationId = locationId
      return { sequence: index + 1, type, shipmentId, locationId, loadAfterLdmTenths: load, legMeters }
    })
    const returnLeg = distance(previousLocationId, baseLocationId)
    const totalMeters = stops.reduce((sum, stop) => sum + stop.legMeters, 0) + returnLeg
    return { truckId: route.truckId, usedLdmTenths, totalMeters, stops }
  })

  const assigned = new Set(plans.flatMap((plan) => plan.stops.map((stop) => stop.shipmentId)))
  return {
    status: 'COMPLETED',
    feasible: true,
    trucksUsed: plans.length,
    trucksLowerBound: trucksLowerBound(shipments, trucks) ?? plans.length,
    totalMeters: plans.reduce((sum, plan) => sum + plan.totalMeters, 0),
    routes: plans,
    unassignedShipmentIds: shipments.filter((s) => !assigned.has(s.id)).map((s) => s.id),
    validation: { passed: true, violations: [] },
  }
}
