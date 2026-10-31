import type { Shipment } from '../../api/types'
import type { RouteRules } from './routePlanner'
import type { SolverInput } from './solver'

// Input of one optimization job, as backend/.../optimization/JobInput.java, with the
// process owner's model: trucks have a payload (B2), and the route rules give start, end
// and loading order instead of BaseSettings.

export interface JobTruck {
  id: number
  name: string
  capacityLdmTenths: number
  /** Infinity: weight is not limited (the Java model) */
  capacityKg: number
}

export interface JobInput {
  shipments: Shipment[]
  /** only the trucks the job may use */
  trucks: JobTruck[]
  /** location ids; location i is row and column i of `distance` */
  locationIds: number[]
  /** metres between locations */
  distance: number[][]
  /** `start` and `end` are indices into locationIds */
  rules: RouteRules
}

/** A shipment without weight counts as 0 kg (the import reads weight, but it may be missing). */
export function weightOf(shipment: Shipment): number {
  return shipment.weightKg ?? 0
}

export function toSolverInput(job: JobInput): SolverInput {
  const index = locationIndex(job)
  return {
    distance: job.distance,
    rules: job.rules,
    shipments: job.shipments.map((s) => ({
      ldmTenths: s.ldmTenths,
      weightKg: weightOf(s),
      pickup: index(s.pickupLocationId),
      delivery: index(s.deliveryLocationId),
    })),
    trucks: job.trucks.map((t) => ({ id: t.id, capacityLdmTenths: t.capacityLdmTenths, capacityKg: t.capacityKg })),
  }
}

/** Index of a location id in job.locationIds; throws for an id the job does not have. */
export function locationIndex(job: JobInput): (locationId: number) => number {
  const byId = new Map(job.locationIds.map((id, i) => [id, i]))
  return (locationId) => {
    const i = byId.get(locationId)
    if (i === undefined) throw new Error(`Location ${locationId} is not in the job`)
    return i
  }
}
