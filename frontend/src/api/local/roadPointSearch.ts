import { haversineMeters, type LatLon } from '../../domain/optimization/distance'
import { pairKey, type RoadDistances, type RoadPoint, type RoadSnap } from './openRouteService'

// A place in a zone closed to lorries can lie on a road they may use, or next to one, and still
// be out of reach: every way there is closed. ORS Snap gives only the nearest road, so points
// all around the place are put on the roads, and the matrix says which of them a lorry reaches.

const RINGS_M = [250, 500, 1000, 1500, 2000, 3000, 4000, 5000]
const POINTS_PER_RING = 6
/** How far from a point around the place a road may be; about the distance between the rings. */
export const POINT_SNAP_RADIUS_M = 1000

/** The place and the points around it, nearest first; with the other place, one matrix request (50 locations). */
export function pointsAround(center: LatLon): LatLon[] {
  const around = RINGS_M.flatMap((meters, ring) =>
    Array.from({ length: POINTS_PER_RING }, (_, k) => {
      // Every other ring turned by half a step, so the points do not line up.
      const bearing = (((k + (ring % 2) / 2) * 360) / POINTS_PER_RING) * (Math.PI / 180)
      return {
        lat: center.lat + (meters * Math.cos(bearing)) / 111_195,
        lon: center.lon + (meters * Math.sin(bearing)) / (111_195 * Math.cos((center.lat * Math.PI) / 180)),
      }
    }),
  )
  return [center, ...around]
}

/**
 * The nearest point on a road, within `radiusMeters` of the place, that a lorry can reach from
 * the other place and leave for it; null when there is none. Two ORS requests.
 */
export async function findReachablePoint({
  place,
  other,
  radiusMeters,
  snap,
  distances,
  request,
}: {
  place: LatLon
  /** a place the lorries do reach */
  other: LatLon
  radiusMeters: number
  snap: RoadSnap
  distances: RoadDistances
  request: Parameters<RoadDistances>[2]
}): Promise<RoadPoint | null> {
  const roads = await snap(pointsAround(place), { ...request, radiusMeters: POINT_SNAP_RADIUS_M })
  const seen = new Set<string>()
  const candidates: RoadPoint[] = []
  for (const road of roads) {
    if (!road) continue
    const key = `${road.at.lat.toFixed(6)},${road.at.lon.toFixed(6)}`
    const distanceMeters = Math.round(haversineMeters(place, road.at))
    if (seen.has(key) || distanceMeters > radiusMeters) continue
    seen.add(key)
    candidates.push({ ...road, distanceMeters })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters)

  // Index 0 is the other place; both ways, since a lorry also has to drive off again.
  const points = [other, ...candidates.map((c) => c.at)]
  const pairs = candidates.flatMap((_, i) => [[0, i + 1] as const, [i + 1, 0] as const])
  const found = await distances(points, pairs, request)
  const reachable = (i: number) => found.get(pairKey(0, i + 1)) != null && found.get(pairKey(i + 1, 0)) != null
  return candidates.find((_, i) => reachable(i)) ?? null
}
