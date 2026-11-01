import type { Shipment } from '../../api/types'
import { formatKg, formatLdm } from '../../format/units'
import { weightOf, type JobTruck } from './job'

// Checks before solving (Spec v2, section 4), as backend/.../optimization/Feasibility.java,
// plus weight (B2). With two phases per route the whole load is on a truck at once, so a
// truck's LDM and weight limit the sums over its shipments. Rear loading never makes a set
// of shipments infeasible (it only makes the route longer), so it is not checked here.
// The dashboard warns with the same checks (over domain/fleet.ts planningFleet).

/** One reason the job cannot have a solution, and whether the shipments or the fleet should change. */
export interface ProvenFinding {
  text: string
  about: 'shipment' | 'fleet'
}

/**
 * `totals: false` for a fleet with a standard truck per shipment (on the device, B1): there
 * a total can exceed the fleet only because of a shipment already named, and "more than
 * the available trucks" would only mislead.
 */
export interface ProvenOptions {
  totals?: boolean
}

/** Reasons the job cannot have a solution (PROVEN); empty when nothing is proven. */
export function provenCauses(shipments: Shipment[], trucks: JobTruck[], options?: ProvenOptions): string[] {
  return provenFindings(shipments, trucks, options).map((f) => f.text)
}

export function provenFindings(shipments: Shipment[], trucks: JobTruck[], { totals = true }: ProvenOptions = {}): ProvenFinding[] {
  const findings: ProvenFinding[] = []
  if (shipments.length === 0) return findings
  if (trucks.length === 0) return [{ text: 'Nijedan kamion nije dostupan.', about: 'fleet' }]
  const shipmentCause = (text: string) => findings.push({ text, about: 'shipment' })
  const fleetCause = (text: string) => findings.push({ text, about: 'fleet' })

  const largestLdm = Math.max(...trucks.map((t) => t.capacityLdmTenths))
  const largestKg = Math.max(...trucks.map((t) => t.capacityKg))
  for (const shipment of shipments) {
    const kg = weightOf(shipment)
    if (shipment.ldmTenths > largestLdm) {
      shipmentCause(
        `Pošiljka ${shipment.externalId} (${formatLdm(shipment.ldmTenths)} LDM) je veća od najvećeg kamiona (${formatLdm(largestLdm)} LDM).`,
      )
    } else if (kg > largestKg) {
      shipmentCause(
        `Pošiljka ${shipment.externalId} (${formatKg(kg)} kg) je teža od najveće nosivosti kamiona (${formatKg(largestKg)} kg).`,
      )
    } else if (!trucks.some((t) => shipment.ldmTenths <= t.capacityLdmTenths && kg <= t.capacityKg)) {
      shipmentCause(
        `Pošiljka ${shipment.externalId} (${formatLdm(shipment.ldmTenths)} LDM, ${formatKg(kg)} kg) ne staje ni u jedan kamion: nijedan nema i dovoljno mesta i dovoljnu nosivost.`,
      )
    }
  }
  if (!totals) return findings

  const totalLdm = sum(shipments.map((s) => s.ldmTenths))
  const capacityLdm = sum(trucks.map((t) => t.capacityLdmTenths))
  if (totalLdm > capacityLdm) {
    fleetCause(`Ukupno ${formatLdm(totalLdm)} LDM je više od kapaciteta dostupnih kamiona (${formatLdm(capacityLdm)} LDM).`)
  }
  const totalKg = sum(shipments.map(weightOf))
  const capacityKg = sum(trucks.map((t) => t.capacityKg))
  if (totalKg > capacityKg) {
    fleetCause(`Ukupno ${formatKg(totalKg)} kg je više od nosivosti dostupnih kamiona (${formatKg(capacityKg)} kg).`)
  }
  return findings
}

/**
 * Lower bound on trucks: the smallest k for which the k largest LDM capacities cover the
 * total LDM and the k largest payloads cover the total weight. null if the whole fleet is
 * not enough.
 */
export function trucksLowerBound(shipments: Shipment[], trucks: JobTruck[]): number | null {
  const byLdm = coveringCount(sum(shipments.map((s) => s.ldmTenths)), trucks.map((t) => t.capacityLdmTenths))
  const byKg = coveringCount(sum(shipments.map(weightOf)), trucks.map((t) => t.capacityKg))
  return byLdm === null || byKg === null ? null : Math.max(byLdm, byKg)
}

function coveringCount(total: number, capacities: number[]): number | null {
  const sorted = [...capacities].sort((a, b) => b - a)
  let covered = 0
  for (let k = 0; k < sorted.length; k++) {
    if (covered >= total) return k
    covered += sorted[k]
  }
  return covered >= total ? sorted.length : null
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}
