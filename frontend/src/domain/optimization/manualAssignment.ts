import type { OptimizationResult } from '../../api/types'
import { formatKg, formatLdm } from '../../format/units'
import { toSolverInput, weightOf, type JobInput } from './job'
import { toOptimizationResult, type TruckRoute } from './result'
import type { Route } from './routePlanner'
import { plannersFor } from './solver'

// The owner moves a shipment to another truck of the job, or takes it off every truck, by
// hand. Only the two trucks concerned are planned again, by the same rules as the solver
// (two phases, rear loading, from where the truck is); the other routes stay as they were.
// Capacity is a hard rule here too: a shipment that does not fit is refused.

export class AssignmentError extends Error {
  readonly kind: 'notFound' | 'doesNotFit'

  constructor(kind: 'notFound' | 'doesNotFit', message: string) {
    super(message)
    this.kind = kind
    this.name = 'AssignmentError'
  }
}

/** The result with the shipment on the truck (`truckId`), or on none (null); the same result when nothing changes. */
export function reassign(job: JobInput, result: OptimizationResult, shipmentId: number, truckId: number | null): OptimizationResult {
  const shipment = job.shipments.findIndex((s) => s.id === shipmentId)
  if (shipment < 0) throw new AssignmentError('notFound', `Pošiljka #${shipmentId} nije u ovom poslu.`)
  const target = truckId === null ? null : job.trucks.findIndex((t) => t.id === truckId)
  if (target === -1) throw new AssignmentError('notFound', `Kamion #${truckId} nije bio u ovom poslu.`)

  // The routes as they are, by truck index, in shipment indices.
  const indexOf = new Map(job.shipments.map((s, i) => [s.id, i]))
  const routes = new Map<number, Route>()
  const truckOf = new Map<number, number>()
  for (const plan of result.routes) {
    const t = job.trucks.findIndex((truck) => truck.id === plan.truckId)
    const order = (type: 'PICKUP' | 'DELIVERY') =>
      plan.stops.filter((stop) => stop.type === type).map((stop) => indexOf.get(stop.shipmentId) as number)
    const route = { pickups: order('PICKUP'), deliveries: order('DELIVERY'), meters: plan.totalMeters }
    routes.set(t, route)
    for (const s of route.pickups) truckOf.set(s, t)
  }

  const source = truckOf.get(shipment) ?? null
  if (source === target) return result
  if (target !== null) assertFits(job, [...routes.get(target)?.pickups ?? [], shipment], target)

  const planners = plannersFor(toSolverInput(job))
  const replan = (t: number, shipments: number[]) => {
    if (shipments.length === 0) routes.delete(t)
    else routes.set(t, planners[t].plan([...shipments].sort((a, b) => a - b)))
  }
  if (source !== null) replan(source, routes.get(source)!.pickups.filter((s) => s !== shipment))
  if (target !== null) replan(target, [...(routes.get(target)?.pickups ?? []), shipment])

  const truckRoutes: TruckRoute[] = [...routes].map(([t, route]) => ({ truckId: job.trucks[t].id, route }))
  return toOptimizationResult(job, truckRoutes)
}

function assertFits(job: JobInput, shipments: number[], t: number): void {
  const truck = job.trucks[t]
  const ldm = shipments.reduce((sum, s) => sum + job.shipments[s].ldmTenths, 0)
  const kg = shipments.reduce((sum, s) => sum + weightOf(job.shipments[s]), 0)
  if (ldm > truck.capacityLdmTenths) {
    throw new AssignmentError(
      'doesNotFit',
      `Ne staje u ${truck.name}: bilo bi ${formatLdm(ldm)} LDM, a kamion prima ${formatLdm(truck.capacityLdmTenths)} LDM.`,
    )
  }
  if (kg > truck.capacityKg) {
    throw new AssignmentError(
      'doesNotFit',
      `Ne staje u ${truck.name}: bilo bi ${formatKg(kg)} kg, a nosivost je ${formatKg(truck.capacityKg)} kg.`,
    )
  }
}
