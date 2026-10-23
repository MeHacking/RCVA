import type { Location, Shipment } from '../../api/types'

/**
 * NOT IN SPEC v2: a shipment has no status field. It is derived from the geocoding
 * status of its pickup and delivery locations; the worst of the two wins.
 */
export type ShipmentStatus = 'OK' | 'MANUAL' | 'LOCATION_ERROR'

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  OK: 'U redu',
  MANUAL: 'Ručno uneta lokacija',
  LOCATION_ERROR: 'Nejasna lokacija',
}

export interface ShipmentRow {
  id: number
  externalId: string
  pickupName: string
  deliveryName: string
  /** postal code of the delivery location (the Excel file identifies destinations by it) */
  deliveryPostalCode: string | null
  ldmTenths: number
  weightKg: number | null
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  status: ShipmentStatus
}

export interface ShipmentTotals {
  count: number
  ldmTenths: number
  withErrors: number
}

export function buildShipmentRows(shipments: Shipment[], locations: Location[]): ShipmentRow[] {
  const byId = new Map(locations.map((l) => [l.id, l]))
  return shipments.map((s) => {
    const pickup = byId.get(s.pickupLocationId)
    const delivery = byId.get(s.deliveryLocationId)
    return {
      id: s.id,
      externalId: s.externalId,
      pickupName: pickup?.name ?? `Lokacija #${s.pickupLocationId}`,
      deliveryName: delivery?.name ?? `Lokacija #${s.deliveryLocationId}`,
      deliveryPostalCode: delivery?.postalCode ?? null,
      ldmTenths: s.ldmTenths,
      weightKg: s.weightKg,
      lengthMm: s.lengthMm,
      widthMm: s.widthMm,
      heightMm: s.heightMm,
      status: worst(locationStatus(pickup), locationStatus(delivery)),
    }
  })
}

export function shipmentTotals(rows: ShipmentRow[]): ShipmentTotals {
  return {
    count: rows.length,
    ldmTenths: rows.reduce((sum, r) => sum + r.ldmTenths, 0),
    withErrors: rows.filter((r) => r.status === 'LOCATION_ERROR').length,
  }
}

function locationStatus(location: Location | undefined): ShipmentStatus {
  // Missing location or coordinates cannot be routed, same as a failed geocode.
  if (!location || location.geocodeStatus === 'FAILED' || location.lat === null || location.lon === null) {
    return 'LOCATION_ERROR'
  }
  return location.geocodeStatus === 'MANUAL' ? 'MANUAL' : 'OK'
}

const SEVERITY: Record<ShipmentStatus, number> = { OK: 0, MANUAL: 1, LOCATION_ERROR: 2 }

function worst(a: ShipmentStatus, b: ShipmentStatus): ShipmentStatus {
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}
