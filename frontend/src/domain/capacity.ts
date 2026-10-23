import type { Shipment, Truck } from '../api/types'

// Capacity rules from Spec v2, section 4. They hold under the "two phases per route"
// assumption (all pickups first, then all deliveries), so the whole load is on the
// truck at once and capacity limits the sum of LDM per route.

/**
 * Lower bound on trucks: the smallest k for which the k largest available capacities
 * cover the total LDM. null if the whole available fleet is not enough.
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

/** Shipments that do not fit even the largest available truck (proves infeasibility). */
export function oversizedShipments(shipments: Shipment[], trucks: Truck[]): Shipment[] {
  const largest = largestAvailableCapacity(trucks)
  return largest === null ? [] : shipments.filter((s) => s.ldmTenths > largest)
}

export function largestAvailableCapacity(trucks: Truck[]): number | null {
  const capacities = trucks.filter((t) => t.available).map((t) => t.capacityLdmTenths)
  return capacities.length > 0 ? Math.max(...capacities) : null
}

export function availableCapacity(trucks: Truck[]): number {
  return trucks.filter((t) => t.available).reduce((sum, t) => sum + t.capacityLdmTenths, 0)
}
