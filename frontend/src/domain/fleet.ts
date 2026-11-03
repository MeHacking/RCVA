import type { Shipment, Truck } from '../api/types'
import { provenFindings } from './optimization/feasibility'
import type { JobTruck } from './optimization/job'

// Standard curtain-siders (process owner's answer B1): "Kamion 1", "Kamion 2"..., which the
// user renames and changes later. Since 03.11.2026 a job uses only the trucks in the list
// (each needs to know where it is); when they are not enough the user is told how many
// standard trucks are missing and adds them, or plans without some shipments.

/**
 * Standard curtain-sider (cerada). capacityKg is not confirmed: the process owner said
 * "I think 13 tonnes", but the sample sheet has single shipments heavier than that, so
 * the usual 24 t for a 13,6 m trailer is used until he answers.
 */
export const STANDARD_TRUCK = {
  capacityLdmTenths: 136,
  capacityKg: 24_000,
  innerLengthMm: 13_600,
  innerWidthMm: 2_480,
  innerHeightMm: 2_700,
} as const

export interface FleetTruck {
  id: number
  name: string
  capacityLdmTenths: number
  capacityKg: number
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
}

/**
 * `count` standard trucks with ids 1..count. One per shipment is always enough when each
 * shipment fits a standard truck; the solver then uses as few of them as it can.
 */
export function standardFleet(count: number): FleetTruck[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `Kamion ${i + 1}`, ...STANDARD_TRUCK }))
}

/** A truck as a job sees it: no payload limit is Infinity (as in the Java model). */
export function toJobTruck(truck: Truck): JobTruck {
  return { id: truck.id, name: truck.name, capacityLdmTenths: truck.capacityLdmTenths, capacityKg: truck.capacityKg ?? Infinity }
}

/** A standard curtain-sider in a job: a truck the user could add (missingTrucks, the extra-truck advice). */
export function standardJobTruck(id: number): JobTruck {
  return { id, name: 'Standardna cerada', capacityLdmTenths: STANDARD_TRUCK.capacityLdmTenths, capacityKg: STANDARD_TRUCK.capacityKg }
}

/**
 * The trucks a job may use: the available ones. The dashboard checks this fleet, so it
 * warns exactly when a job would be refused as PROVEN.
 */
export function planningFleet(trucks: Truck[]): JobTruck[] {
  return trucks.filter((t) => t.available).map(toJobTruck)
}

/**
 * How many standard trucks must at least join `trucks` before nothing is proven against
 * the job (LDM and weight, each shipment and the totals); 0 when nothing is. null when no
 * number helps: a shipment does not fit even a standard truck. A lower bound: the solver
 * may still need one more, since shipments are not divisible.
 */
export function missingTrucks(shipments: Shipment[], trucks: JobTruck[]): number | null {
  for (let k = 0; k <= shipments.length; k++) {
    const fleet = [...trucks, ...Array.from({ length: k }, (_, i) => standardJobTruck(-(i + 1)))]
    if (provenFindings(shipments, fleet).length === 0) return k
  }
  return null
}

/** "Kamion N" with the smallest N no truck is named yet. */
export function nextStandardName(names: Iterable<string>): string {
  const taken = new Set(names)
  let n = 1
  while (taken.has(`Kamion ${n}`)) n++
  return `Kamion ${n}`
}
