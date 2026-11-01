import type { Location, Shipment, Truck } from '../../api/types'
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
  /** the application adds standard trucks as needed (on the device), so their number is not limited */
  unlimitedFleet: boolean
  /** by LDM and weight; null when the fleet cannot carry everything (or a shipment fits no truck) */
  trucksLowerBound: number | null
  warnings: DashboardWarning[]
}

/**
 * Figures and warnings for the dashboard. The danger warnings are the checks a job makes
 * before solving (PROVEN, feasibility.ts), over the fleet the job would get
 * (planningFleet: on the device with standard trucks added), so the user sees exactly
 * the reasons a job would be refused with HTTP 422, weight included.
 */
export function buildDashboardModel(
  shipments: Shipment[],
  locations: Location[],
  trucks: Truck[],
  { unlimitedFleet = false }: { unlimitedFleet?: boolean } = {},
): DashboardModel {
  const totals = shipmentTotals(buildShipmentRows(shipments, locations))
  const fleet = planningFleet(trucks, shipments.length, unlimitedFleet)
  const findings = provenFindings(shipments, fleet, { totals: !unlimitedFleet })
  const warnings: DashboardWarning[] = findings.map((finding) => ({
    tone: 'danger',
    text: finding.text,
    link: finding.about === 'shipment' ? { to: '/shipments', label: 'Pošiljke' } : { to: '/trucks', label: 'Kamioni' },
  }))

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
    unlimitedFleet,
    // A bound next to a proven reason would suggest a solution exists.
    trucksLowerBound: shipments.length > 0 && findings.length === 0 ? trucksLowerBound(shipments, fleet) : null,
    warnings,
  }
}
