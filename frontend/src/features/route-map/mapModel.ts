import type { Location, OptimizationResult, StopType } from '../../api/types'
import type { ReferenceData } from '../optimization/resultRows'

// What the route map draws, without Leaflet, so it can be tested: one line per route
// from stop to stop (straight, not along the roads), and one mark per place.

/** --route-1 ... --route-8 in tokens.css; routes beyond that repeat the colors. */
export const ROUTE_COLORS = 8

export type LatLng = [number, number]

export interface MapRoute {
  truckId: number
  truckName: string
  /** 1..ROUTE_COLORS, by the route's place in the result, so a filter never changes it */
  color: number
  /** stops in visiting order, with the base first and last on a route that returns to it */
  path: LatLng[]
}

export type PlaceKind = 'pickup' | 'delivery' | 'both' | 'base'

export interface MapPlace {
  locationId: number
  name: string
  at: LatLng
  kind: PlaceKind
  /** color of the first visible route that stops here */
  color: number
  /** one line per visit, e.g. "Šleper 1 · 2. preuzimanje S-101" */
  visits: string[]
}

export interface MapModel {
  routes: MapRoute[]
  places: MapPlace[]
  /** names of visible stops that cannot be drawn: their place has no coordinates */
  missing: string[]
}

export const routeColor = (result: OptimizationResult, truckId: number) =>
  (result.routes.findIndex((r) => r.truckId === truckId) % ROUTE_COLORS) + 1

const STOP_NAMES: Record<StopType, string> = { PICKUP: 'preuzimanje', DELIVERY: 'isporuka' }

export function buildMapModel(result: OptimizationResult, reference: ReferenceData, truckIds: number[]): MapModel {
  const locations = new Map(reference.locations.map((l) => [l.id, l]))
  const trucks = new Map(reference.trucks.map((t) => [t.id, t]))
  const shipments = new Map(reference.shipments.map((s) => [s.id, s]))
  const at = (location: Location | undefined): LatLng | null =>
    location && location.lat !== null && location.lon !== null ? [location.lat, location.lon] : null

  const places = new Map<number, MapPlace>()
  const place = (location: Location, kind: PlaceKind, color: number) => {
    const existing = places.get(location.id)
    if (existing) {
      if (existing.kind !== kind && existing.kind !== 'base') existing.kind = kind === 'base' ? 'base' : 'both'
      return existing
    }
    const created: MapPlace = { locationId: location.id, name: location.name, at: at(location) as LatLng, kind, color, visits: [] }
    places.set(location.id, created)
    return created
  }

  const routes: MapRoute[] = []
  const missing = new Set<string>()
  const base = result.openRoute ? undefined : locations.get(reference.base.baseLocationId)
  for (const route of result.routes.filter((r) => truckIds.includes(r.truckId))) {
    const color = routeColor(result, route.truckId)
    const truckName = trucks.get(route.truckId)?.name ?? `Kamion #${route.truckId}`
    const path: LatLng[] = []
    const baseAt = at(base)
    if (base && baseAt) {
      path.push(baseAt)
      place(base, 'base', color).visits.push(`${truckName} · baza`)
    }
    route.stops.forEach((stop, i) => {
      const location = locations.get(stop.locationId)
      const point = at(location)
      if (!location || !point) {
        missing.add(location?.name ?? `mesto #${stop.locationId}`)
        return
      }
      path.push(point)
      const shipment = shipments.get(stop.shipmentId)?.externalId ?? `#${stop.shipmentId}`
      place(location, stop.type === 'PICKUP' ? 'pickup' : 'delivery', color).visits.push(
        `${truckName} · ${i + 1}. ${STOP_NAMES[stop.type]} ${shipment}`,
      )
    })
    if (base && baseAt && route.stops.length > 0) path.push(baseAt)
    routes.push({ truckId: route.truckId, truckName, color, path })
  }
  return { routes, places: [...places.values()], missing: [...missing] }
}
