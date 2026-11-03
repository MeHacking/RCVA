import type { Location, OptimizationResult, Shipment, Truck, TruckStart } from '../../api/types'
import { availableCapacity } from '../../domain/capacity'
import { planningFleet } from '../../domain/fleet'
import { provenFindings, trucksLowerBound } from '../../domain/optimization/feasibility'
import { weightOf } from '../../domain/optimization/job'
import { routeColor } from '../route-map/mapModel'
import { buildShipmentRows, shipmentTotals, type ShipmentStatus } from '../shipments/shipmentRows'

export interface DashboardWarning {
  tone: 'warning' | 'danger'
  text: string
  link: { to: string; label: string }
}

export interface DashboardModel {
  shipmentCount: number
  totalLdmTenths: number
  shipmentsWithErrors: number
  availableTrucks: number
  totalTrucks: number
  availableCapacityTenths: number
  /** by LDM and weight; null when the fleet cannot carry everything (or a shipment fits no truck) */
  trucksLowerBound: number | null
  warnings: DashboardWarning[]
  /** all shipments, a missing weight counted as 0 kg */
  totalWeightKg: number
  /** payload of the available trucks; null when one of them has no limit (weight is then not limited) */
  availableCapacityKg: number | null
  /** shipments by status, for the status ring */
  statusCounts: Record<ShipmentStatus, number>
}

/** How full a load is: up to 85 % normal, up to 100 % high, above that over the limit. */
export type LoadLevel = 'normal' | 'high' | 'over'

export function loadLevel(used: number, capacity: number): LoadLevel {
  if (used > capacity) return 'over'
  return used > 0.85 * capacity ? 'high' : 'normal'
}

/** One truck of the last result, for the dashboard. */
export interface TruckLoad {
  truckId: number
  name: string
  /** its route color (1..ROUTE_COLORS), as on the map */
  color: number
  usedLdmTenths: number
  /** null when the truck is no longer in the list */
  capacityLdmTenths: number | null
  weightKg: number
  /** null: no limit, or the truck is no longer in the list */
  capacityKg: number | null
  meters: number
}

/**
 * Figures and warnings for the dashboard. The danger warnings are the checks a job makes
 * before solving (PROVEN, feasibility.ts), over the fleet the job would get
 * (planningFleet: the available trucks), so the user sees exactly
 * the reasons a job would be refused with HTTP 422, weight included. On the device (`starts`)
 * it also warns about available trucks that do not know where they are, or whose proposed
 * location waits to be confirmed: a job asks for them first.
 */
export function buildDashboardModel(
  shipments: Shipment[],
  locations: Location[],
  trucks: Truck[],
  starts: TruckStart[] | null = null,
): DashboardModel {
  const totals = shipmentTotals(buildShipmentRows(shipments, locations))
  const fleet = planningFleet(trucks)
  const findings = provenFindings(shipments, fleet)
  const warnings: DashboardWarning[] = findings.map((finding) => ({
    tone: 'danger',
    text: finding.text,
    link: finding.about === 'shipment' ? { to: '/shipments', label: 'Pošiljke' } : { to: '/trucks', label: 'Kamioni' },
  }))

  if (starts) {
    const available = new Set(trucks.filter((t) => t.available).map((t) => t.id))
    const mine = starts.filter((s) => available.has(s.truckId))
    const missing = mine.filter((s) => !s.location).length
    const proposed = mine.filter((s) => s.location && s.proposal).length
    const toTrucks = { to: '/trucks', label: 'Kamioni' }
    if (missing > 0) {
      warnings.push({ tone: 'warning', text: `Kamioni bez lokacije: ${missing}. Pre optimizacije unesite gde se nalaze.`, link: toTrucks })
    }
    if (proposed > 0) {
      warnings.push({ tone: 'warning', text: `Predlozi novih lokacija kamiona čekaju potvrdu: ${proposed}.`, link: toTrucks })
    }
  }

  if (totals.withErrors > 0) {
    warnings.push({
      tone: 'warning',
      text: `Pošiljke sa nejasnom lokacijom: ${totals.withErrors}. Bez koordinata ne mogu da uđu u rutu.`,
      link: { to: '/shipments', label: 'Pošiljke' },
    })
  }

  return {
    shipmentCount: totals.count,
    totalLdmTenths: totals.ldmTenths,
    shipmentsWithErrors: totals.withErrors,
    availableTrucks: trucks.filter((t) => t.available).length,
    totalTrucks: trucks.length,
    availableCapacityTenths: availableCapacity(trucks),
    // A bound next to a proven reason would suggest a solution exists.
    trucksLowerBound: shipments.length > 0 && findings.length === 0 ? trucksLowerBound(shipments, fleet) : null,
    warnings,
    totalWeightKg: shipments.reduce((sum, s) => sum + weightOf(s), 0),
    availableCapacityKg: availableCapacityKg(trucks),
    statusCounts: countStatuses(buildShipmentRows(shipments, locations).map((r) => r.status)),
  }
}

function availableCapacityKg(trucks: Truck[]): number | null {
  const available = trucks.filter((t) => t.available)
  if (available.some((t) => t.capacityKg === null)) return null
  return available.reduce((sum, t) => sum + (t.capacityKg ?? 0), 0)
}

function countStatuses(statuses: ShipmentStatus[]): Record<ShipmentStatus, number> {
  const counts: Record<ShipmentStatus, number> = { OK: 0, MANUAL: 0, LOCATION_ERROR: 0 }
  for (const status of statuses) counts[status]++
  return counts
}

/**
 * The trucks of a result with their load and kilometres, in the result's order. Names,
 * capacities and weights come from the present lists, as on the results screen.
 */
export function truckLoads(result: OptimizationResult, trucks: Truck[], shipments: Shipment[]): TruckLoad[] {
  const weights = new Map(shipments.map((s) => [s.id, weightOf(s)]))
  return result.routes.map((route) => {
    const truck = trucks.find((t) => t.id === route.truckId)
    const picked = route.stops.filter((s) => s.type === 'PICKUP')
    return {
      truckId: route.truckId,
      name: truck?.name ?? `Kamion #${route.truckId}`,
      color: routeColor(result, route.truckId),
      usedLdmTenths: route.usedLdmTenths,
      capacityLdmTenths: truck?.capacityLdmTenths ?? null,
      weightKg: picked.reduce((sum, s) => sum + (weights.get(s.shipmentId) ?? 0), 0),
      capacityKg: truck?.capacityKg ?? null,
      meters: route.totalMeters,
    }
  })
}
