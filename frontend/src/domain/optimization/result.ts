import type { OptimizationResult, RoutePlan, RouteStop, StopType } from '../../api/types'
import { trucksLowerBound } from './feasibility'
import { locationIndex, type JobInput } from './job'
import type { Route } from './routePlanner'
import { validate } from './validator'

// Builds the API result from the solver's routes, as toResult in
// backend/.../optimization/solver/RoutingSolver.java, and has it checked by the
// independent validator.

export interface TruckRoute {
  truckId: number
  /** shipment indices into job.shipments; `meters` is not used, lengths are recomputed */
  route: Route
}

/** Only for a feasible solution; otherwise the job ends as INFEASIBLE / NOT_FOUND without a result. */
export function toOptimizationResult(job: JobInput, routes: TruckRoute[]): OptimizationResult {
  const byTruck = new Map(routes.filter((r) => r.route.pickups.length > 0).map((r) => [r.truckId, r.route]))
  const plans = job.trucks.flatMap((truck) => {
    const route = byTruck.get(truck.id)
    return route ? [routePlan(job, truck.id, route)] : []
  })
  const assigned = new Set(plans.flatMap((p) => p.stops.map((s) => s.shipmentId)))
  const result: OptimizationResult = {
    status: 'COMPLETED',
    feasible: true,
    trucksUsed: plans.length,
    trucksLowerBound: trucksLowerBound(job.shipments, job.trucks) ?? plans.length,
    totalMeters: plans.reduce((sum, p) => sum + p.totalMeters, 0),
    routes: plans,
    unassignedShipmentIds: job.shipments.filter((s) => !assigned.has(s.id)).map((s) => s.id),
    validation: { passed: true, violations: [] },
  }
  return { ...result, validation: validate(job, result) }
}

function routePlan(job: JobInput, truckId: number, route: Route): RoutePlan {
  const index = locationIndex(job)
  const stops: RouteStop[] = []
  let at = job.rules.start
  let load = 0
  let maxLoad = 0
  let meters = 0
  const visits: Array<[StopType, number[]]> = [
    ['PICKUP', route.pickups],
    ['DELIVERY', route.deliveries],
  ]
  for (const [type, order] of visits) {
    for (const s of order) {
      const shipment = job.shipments[s]
      const locationId = type === 'PICKUP' ? shipment.pickupLocationId : shipment.deliveryLocationId
      const location = index(locationId)
      load += type === 'PICKUP' ? shipment.ldmTenths : -shipment.ldmTenths
      maxLoad = Math.max(maxLoad, load)
      const legMeters = at === null ? 0 : job.distance[at][location]
      meters += legMeters
      stops.push({ sequence: stops.length + 1, type, shipmentId: shipment.id, locationId, loadAfterLdmTenths: load, legMeters })
      at = location
    }
  }
  if (job.rules.end !== null && at !== null) meters += job.distance[at][job.rules.end]
  return { truckId, usedLdmTenths: maxLoad, totalMeters: meters, stops }
}
