import type { Location, Shipment, Truck, TruckStart } from '../../api/types'
import { availableCapacity } from '../../domain/capacity'
import { planningFleet } from '../../domain/fleet'
import { provenFindings, trucksLowerBound } from '../../domain/optimization/feasibility'
import { buildShipmentRows, shipmentTotals } from '../shipments/shipmentRows'

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
  }
}
