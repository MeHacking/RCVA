import { haversineMeters, type LatLon } from '../../domain/optimization/distance'
import { MAX_LOCATIONS_PER_REQUEST, pairKey, type RoadDistances, type RoadPoint, type RoadSnap } from './openRouteService'

// A place in a zone closed to lorries can lie on a road they may use, or next to one, and still
// be out of reach: every way there is closed. ORS Snap gives only the nearest road, so points
// around the place are put on the roads, and the matrix says which of them a lorry reaches.
// First up to FIRST_RADIUS_M, then one kilometre farther each time nothing is found.

export const FIRST_RADIUS_M = 5000
export const LAST_RADIUS_M = 10_000
const RADIUS_STEP_M = 1000
const RINGS_M = [250, 500, 1000, 1500, 2000, 3000, 4000, FIRST_RADIUS_M]
const POINTS_PER_RING = 6
const POINTS_PER_FAR_RING = 36
/** A point on the last ring is only about that far (a few metres either way), so it needs some room. */
const FARTHEST_M = LAST_RADIUS_M + 100
/** How far from a point around the place a road may be; about the distance between the points. */
export const POINT_SNAP_RADIUS_M = 1000

function offset(center: LatLon, meters: number, degrees: number): LatLon {
  const bearing = degrees * (Math.PI / 180)
  return {
    lat: center.lat + (meters * Math.cos(bearing)) / 111_195,
    lon: center.lon + (meters * Math.sin(bearing)) / (111_195 * Math.cos((center.lat * Math.PI) / 180)),
  }
}

/** The place and the points around it up to FIRST_RADIUS_M, nearest first. */
export function pointsAround(center: LatLon): LatLon[] {
  const around = RINGS_M.flatMap((meters, ring) =>
    // Every other ring turned by half a step, so the points do not line up.
    Array.from({ length: POINTS_PER_RING }, (_, k) => offset(center, meters, ((k + (ring % 2) / 2) * 360) / POINTS_PER_RING)),
  )
  return [center, ...around]
}

/** The points of one ring farther out; there are more of them, as the ring is longer. */
export function pointsOnFarRing(center: LatLon, meters: number): LatLon[] {
  return Array.from({ length: POINTS_PER_FAR_RING }, (_, k) => offset(center, meters, (k * 360) / POINTS_PER_FAR_RING))
}

function searchRounds(center: LatLon): LatLon[][] {
  const rounds = [pointsAround(center)]
  for (let meters = FIRST_RADIUS_M + RADIUS_STEP_M; meters <= LAST_RADIUS_M; meters += RADIUS_STEP_M) {
    rounds.push(pointsOnFarRing(center, meters))
  }
  return rounds
}

export interface ReachableSearch {
  /** the nearest point a lorry reaches; null when there is none */
  road: RoadPoint | null
  /** how many different points on roads were checked */
  tried: number
}

/**
 * The nearest point on a road that a lorry can reach from one of the other places and leave for
 * it. The other places are put on the roads too, since one off the roads would make every point
 * look cut off. Two ORS requests for each radius tried.
 */
export async function findReachablePoint({
  place,
  others,
  snap,
  distances,
  request,
}: {
  place: LatLon
  /** places the lorries reach, as far as is known */
  others: LatLon[]
  snap: RoadSnap
  distances: RoadDistances
  request: Parameters<RoadDistances>[2]
}): Promise<ReachableSearch> {
  if (others.length === 0) return { road: null, tried: 0 }
  const seen = new Set<string>()
  let tried = 0
  let anchors: LatLon[] | null = null
  for (const points of searchRounds(place)) {
    const asked = anchors ? points : [...points, ...others]
    const roads = await snap(asked, { ...request, radiusMeters: POINT_SNAP_RADIUS_M })
    anchors ??= roads.slice(points.length).flatMap((road) => (road ? [road.at] : []))
    if (anchors.length === 0) return { road: null, tried: 0 }

    const candidates: RoadPoint[] = []
    for (const road of roads.slice(0, points.length)) {
      if (!road) continue
      const key = `${road.at.lat.toFixed(6)},${road.at.lon.toFixed(6)}`
      const distanceMeters = Math.round(haversineMeters(place, road.at))
      if (seen.has(key) || distanceMeters > FARTHEST_M) continue
      seen.add(key)
      candidates.push({ ...road, distanceMeters })
    }
    candidates.sort((a, b) => a.distanceMeters - b.distanceMeters)
    candidates.splice(MAX_LOCATIONS_PER_REQUEST - anchors.length)
    if (candidates.length === 0) continue
    tried += candidates.length

    // The anchors come first; both ways, since a lorry also has to drive off again.
    const count = anchors.length
    const pairs = candidates.flatMap((_, i) => anchors!.flatMap((_, a) => [[a, count + i] as const, [count + i, a] as const]))
    const found = await distances([...anchors, ...candidates.map((c) => c.at)], pairs, request)
    const reachable = (i: number) =>
      anchors!.some((_, a) => found.get(pairKey(a, count + i)) != null && found.get(pairKey(count + i, a)) != null)
    const road = candidates.find((_, i) => reachable(i))
    if (road) return { road, tried }
  }
  return { road: null, tried }
}
