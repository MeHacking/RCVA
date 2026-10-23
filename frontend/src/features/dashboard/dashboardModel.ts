import type { Location, Shipment, Truck } from '../../api/types'
import {
  availableCapacity,
  largestAvailableCapacity,
  oversizedShipments,
  trucksLowerBound,
} from '../../domain/capacity'
import { formatLdm } from '../../format/units'
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
  /** null when the available fleet cannot carry everything (or a shipment fits no truck) */
  trucksLowerBound: number | null
  warnings: DashboardWarning[]
}

/**
 * Figures and warnings for the dashboard. The danger warnings are the checks that
 * prove infeasibility before solving (Spec v2, section 4), so the user sees them
 * before starting a job that would end with HTTP 422.
 */
export function buildDashboardModel(shipments: Shipment[], locations: Location[], trucks: Truck[]): DashboardModel {
  const totals = shipmentTotals(buildShipmentRows(shipments, locations))
  const capacity = availableCapacity(trucks)
  const available = trucks.filter((t) => t.available).length
  const warnings: DashboardWarning[] = []

  if (shipments.length > 0 && available === 0) {
    warnings.push({
      tone: 'danger',
      text: 'Nijedan kamion nije označen kao dostupan, pa optimizacija ne može da se pokrene.',
      link: { to: '/trucks', label: 'Kamioni' },
    })
  }

  const largest = largestAvailableCapacity(trucks)
  const oversized = oversizedShipments(shipments, trucks)
  for (const shipment of oversized) {
    warnings.push({
      tone: 'danger',
      text: `Pošiljka ${shipment.externalId} (${formatLdm(shipment.ldmTenths)} LDM) je veća od najvećeg dostupnog kamiona (${formatLdm(largest ?? 0)} LDM).`,
      link: { to: '/shipments', label: 'Pošiljke' },
    })
  }

  if (available > 0 && totals.ldmTenths > capacity) {
    warnings.push({
      tone: 'danger',
      text: `Ukupno ${formatLdm(totals.ldmTenths)} LDM je više od kapaciteta dostupnih kamiona (${formatLdm(capacity)} LDM).`,
      link: { to: '/trucks', label: 'Kamioni' },
    })
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
    availableTrucks: available,
    totalTrucks: trucks.length,
    availableCapacityTenths: capacity,
    // A bound next to a shipment that fits no truck would suggest a solution exists.
    trucksLowerBound: shipments.length > 0 && oversized.length === 0 ? trucksLowerBound(shipments, trucks) : null,
    warnings,
  }
}
