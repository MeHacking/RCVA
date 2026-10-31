import { describe, expect, it } from 'vitest'
import type { Location, OptimizationResult, RouteStop, Shipment, Truck } from '../../src/api/types'
import type { ReferenceData } from '../../src/features/optimization/resultRows'
import { buildMapModel, ROUTE_COLORS, routeColor } from '../../src/features/route-map/mapModel'

// Invented places: a base, two warehouses (one shared by both routes), deliveries, and one
// place without coordinates.
const place = (id: number, name: string, lat: number | null, lon: number | null): Location => ({
  id,
  name,
  address: null,
  country: null,
  postalCode: null,
  lat,
  lon,
  geocodeStatus: lat === null ? 'FAILED' : 'OK',
})
const LOCATIONS = [
  place(1, 'Baza', 44.0, 20.0),
  place(2, 'Magacin A', 45.0, 20.0),
  place(3, 'Magacin B', 46.0, 21.0),
  place(4, 'Kupac X', 57.0, 12.0),
  place(5, 'Kupac Y', 58.0, 13.0),
  place(6, 'Bez koordinata', null, null),
]
const shipment = (id: number): Shipment =>
  ({ id, externalId: `P-${id}`, pickupLocationId: 0, deliveryLocationId: 0 }) as Shipment
const truck = (id: number, name: string): Truck => ({ id, name }) as Truck
const REFERENCE: ReferenceData = {
  trucks: [truck(1, 'Cerada 1'), truck(2, 'Cerada 2')],
  shipments: [shipment(11), shipment(12), shipment(13)],
  locations: LOCATIONS,
  base: { baseLocationId: 1, returnToBase: true },
}

const stop = (type: 'PICKUP' | 'DELIVERY', shipmentId: number, locationId: number): RouteStop => ({
  sequence: 0,
  type,
  shipmentId,
  locationId,
  loadAfterLdmTenths: 0,
  legMeters: 0,
})

function result(openRoute: boolean): OptimizationResult {
  return {
    status: 'COMPLETED',
    feasible: true,
    trucksUsed: 2,
    trucksLowerBound: 2,
    totalMeters: 0,
    unassignedShipmentIds: [],
    validation: { passed: true, violations: [] },
    openRoute,
    routes: [
      { truckId: 2, usedLdmTenths: 0, totalMeters: 0, stops: [stop('PICKUP', 11, 2), stop('PICKUP', 12, 3), stop('DELIVERY', 12, 5), stop('DELIVERY', 11, 4)] },
      { truckId: 1, usedLdmTenths: 0, totalMeters: 0, stops: [stop('PICKUP', 13, 2), stop('DELIVERY', 13, 6)] },
    ],
  }
}

describe('route map model', () => {
  it('draws an open route from the first pickup to the last delivery, without the base', () => {
    const model = buildMapModel(result(true), REFERENCE, [2])
    expect(model.routes).toEqual([
      {
        truckId: 2,
        truckName: 'Cerada 2',
        color: 1,
        path: [
          [45, 20],
          [46, 21],
          [58, 13],
          [57, 12],
        ],
      },
    ])
    expect(model.places.map((p) => [p.name, p.kind])).toEqual([
      ['Magacin A', 'pickup'],
      ['Magacin B', 'pickup'],
      ['Kupac Y', 'delivery'],
      ['Kupac X', 'delivery'],
    ])
    expect(model.places[2].visits).toEqual(['Cerada 2 · 3. isporuka P-12'])
    expect(model.missing).toEqual([])
  })

  it('starts and ends a route that returns at the base', () => {
    const model = buildMapModel(result(false), REFERENCE, [2])
    const path = model.routes[0].path
    expect([path[0], path.at(-1), path.length]).toEqual([[44, 20], [44, 20], 6])
    expect(model.places[0]).toMatchObject({ name: 'Baza', kind: 'base', visits: ['Cerada 2 · baza'] })
  })

  it('keeps each route its color when filtered, and lists both visits at a shared place', () => {
    const all = buildMapModel(result(true), REFERENCE, [1, 2])
    const only = buildMapModel(result(true), REFERENCE, [1])
    expect(all.routes.map((r) => [r.truckId, r.color])).toEqual([
      [2, 1],
      [1, 2],
    ])
    expect(only.routes.map((r) => r.color)).toEqual([2])
    expect(all.places.find((p) => p.name === 'Magacin A')?.visits).toEqual([
      'Cerada 2 · 1. preuzimanje P-11',
      'Cerada 1 · 1. preuzimanje P-13',
    ])
  })

  it('leaves out stops without coordinates and names their places', () => {
    const model = buildMapModel(result(true), REFERENCE, [1])
    expect(model.routes[0].path).toEqual([[45, 20]])
    expect(model.missing).toEqual(['Bez koordinata'])
  })

  it('marks a place with pickups and deliveries as both', () => {
    const r = result(true)
    r.routes[1].stops = [stop('PICKUP', 13, 4), stop('DELIVERY', 13, 2)]
    const model = buildMapModel(r, REFERENCE, [1, 2])
    expect(model.places.find((p) => p.name === 'Magacin A')?.kind).toBe('both')
    expect(model.places.find((p) => p.name === 'Kupac X')?.kind).toBe('both')
  })

  it('repeats the colors after the last one', () => {
    const many = { ...result(true), routes: Array.from({ length: ROUTE_COLORS + 1 }, (_, i) => ({ ...result(true).routes[0], truckId: 100 + i })) }
    expect(routeColor(many, 100)).toBe(1)
    expect(routeColor(many, 100 + ROUTE_COLORS - 1)).toBe(ROUTE_COLORS)
    expect(routeColor(many, 100 + ROUTE_COLORS)).toBe(1)
  })
})
