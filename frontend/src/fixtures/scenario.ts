import type { BaseSettings, Location, OptimizationResult, Shipment, Truck } from '../api/types'

/** Outcome the mock API reports for any optimization job started on this scenario. */
export type ScenarioOutcome =
  | { kind: 'COMPLETED'; result: OptimizationResult }
  | { kind: 'PROVEN'; causes: string[] }
  | { kind: 'NOT_FOUND'; trucksLowerBound: number }

export interface Scenario {
  name: string
  description: string
  locations: Location[]
  shipments: Shipment[]
  trucks: Truck[]
  base: BaseSettings
  outcome: ScenarioOutcome
}

export function location(
  id: number,
  name: string,
  country: string,
  postalCode: string | null,
  latLon: readonly [number, number] | null,
): Location {
  return {
    id,
    name,
    address: null,
    country,
    postalCode,
    lat: latLon?.[0] ?? null,
    lon: latLon?.[1] ?? null,
    geocodeStatus: latLon ? 'OK' : 'MANUAL',
  }
}

export function shipment(
  id: number,
  externalId: string,
  ldmTenths: number,
  pickupLocationId: number,
  deliveryLocationId: number,
  extra: Partial<Pick<Shipment, 'description' | 'weightKg' | 'lengthMm' | 'widthMm' | 'heightMm'>> = {},
): Shipment {
  return {
    id,
    externalId,
    description: null,
    ldmTenths,
    pickupLocationId,
    deliveryLocationId,
    splittable: false,
    weightKg: null,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    ...extra,
  }
}

export function truck(
  id: number,
  name: string,
  capacityLdmTenths: number,
  innerMm: readonly [number, number, number] | null,
  available = true,
  capacityKg: number | null = null,
): Truck {
  return {
    id,
    name,
    capacityLdmTenths,
    capacityKg,
    available,
    innerLengthMm: innerMm?.[0] ?? null,
    innerWidthMm: innerMm?.[1] ?? null,
    innerHeightMm: innerMm?.[2] ?? null,
  }
}
