import type { BaseSettings, Location, OptimizationResult, Shipment, StopType, Truck } from '../../api/types'

/** Master data needed to turn ids in a result into readable rows. */
export interface ReferenceData {
  trucks: Truck[]
  shipments: Shipment[]
  locations: Location[]
  base: BaseSettings
}

export interface StopRow {
  sequence: number
  type: StopType
  locationName: string
  shipmentLabel: string
  loadAfterLdmTenths: number
  legMeters: number
}

export interface TruckRow {
  truckId: number
  truckName: string
  /** null when the truck is no longer in the master data */
  capacityLdmTenths: number | null
  usedLdmTenths: number
  /** in pickup order */
  shipmentLabels: string[]
  totalMeters: number
  stops: StopRow[]
  /** last stop -> base; not a stop in the API, derived as total minus legs */
  returnLegMeters: number
  baseName: string
  /** starts at the first pickup and ends at the last delivery, without the base */
  openRoute: boolean
}

export interface UnassignedRow {
  shipmentId: number
  label: string
  ldmTenths: number | null
  pickupName: string
  deliveryName: string
}

// NOTE: names and capacities come from the current master data. The specification wants
// results tied to the job's input snapshot, which the API does not expose yet.

export function buildTruckRows(result: OptimizationResult, ref: ReferenceData): TruckRow[] {
  const names = lookups(ref)
  return result.routes.map((route) => {
    const truck = ref.trucks.find((t) => t.id === route.truckId)
    const legs = route.stops.reduce((sum, stop) => sum + stop.legMeters, 0)
    return {
      truckId: route.truckId,
      truckName: truck?.name ?? `Kamion #${route.truckId}`,
      capacityLdmTenths: truck?.capacityLdmTenths ?? null,
      usedLdmTenths: route.usedLdmTenths,
      shipmentLabels: route.stops.filter((s) => s.type === 'PICKUP').map((s) => names.shipment(s.shipmentId)),
      totalMeters: route.totalMeters,
      stops: route.stops.map((stop) => ({
        sequence: stop.sequence,
        type: stop.type,
        locationName: names.location(stop.locationId),
        shipmentLabel: names.shipment(stop.shipmentId),
        loadAfterLdmTenths: stop.loadAfterLdmTenths,
        legMeters: stop.legMeters,
      })),
      returnLegMeters: route.totalMeters - legs,
      baseName: names.location(ref.base.baseLocationId),
      openRoute: result.openRoute ?? false,
    }
  })
}

export function buildUnassignedRows(result: OptimizationResult, ref: ReferenceData): UnassignedRow[] {
  const names = lookups(ref)
  return result.unassignedShipmentIds.map((id) => {
    const shipment = ref.shipments.find((s) => s.id === id)
    return {
      shipmentId: id,
      label: names.shipment(id),
      ldmTenths: shipment?.ldmTenths ?? null,
      pickupName: shipment ? names.location(shipment.pickupLocationId) : '–',
      deliveryName: shipment ? names.location(shipment.deliveryLocationId) : '–',
    }
  })
}

function lookups(ref: ReferenceData) {
  const locations = new Map(ref.locations.map((l) => [l.id, l.name]))
  const shipments = new Map(ref.shipments.map((s) => [s.id, s.externalId]))
  return {
    location: (id: number) => locations.get(id) ?? `Lokacija #${id}`,
    shipment: (id: number) => shipments.get(id) ?? `Pošiljka #${id}`,
  }
}
