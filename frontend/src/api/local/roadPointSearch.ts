import { haversineMeters, type LatLon } from '../../domain/optimization/distance'
import { MAX_LOCATIONS_PER_REQUEST, pairKey, type RoadDistances, type RoadPoint, type RoadSnap } from './openRouteService'

// The user writes a town, and the point found for it can be where lorries may not go: a centre
// closed to them, a street every way to which is closed. So the places out of reach are moved
// to the nearest point a lorry does reach. ORS Snap gives only the nearest road, so points around
// the place are put on the roads, and the matrix says which of them a lorry reaches.
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
/** More places out of reach than this is no matter of single places, and searching would only spend requests. */
export const MAX_PLACES_SEARCHED = 10

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

/**
 * The places in the way of a road between every two places: taken out one at a time, the one
 * with the most missing roads first, until all the rest reach each other both ways. One bad
 * place then stands out, instead of every place it has no road with.
 */
export function placesOutOfReach(count: number, hasRoad: (from: number, to: number) => boolean): number[] {
  const rest = new Set(Array.from({ length: count }, (_, i) => i))
  const missing = (i: number) => [...rest].filter((j) => j !== i && !(hasRoad(i, j) && hasRoad(j, i))).length
  const out: number[] = []
  for (;;) {
    let worst = -1
    let most = 0
    for (const i of rest) {
      const roads = missing(i)
      if (roads > most) {
        most = roads
        worst = i
      }
    }
    if (worst < 0) return out
    rest.delete(worst)
    out.push(worst)
  }
}

/** Whether moving those places can help: a few of them, and the rest clearly the places that are fine. */
export function worthSearching(outOfReach: number, places: number): boolean {
  return outOfReach > 0 && outOfReach <= MAX_PLACES_SEARCHED && (places - outOfReach) * 2 > places
}

/**
 * The nearest point on a road that a lorry can reach from `other` and leave for it; null when
 * there is none up to LAST_RADIUS_M. Two ORS requests for each radius tried.
 */
export async function findReachablePoint({
  place,
  other,
  snap,
  distances,
  request,
}: {
  place: LatLon
  /** a place the lorries do reach */
  other: LatLon
  snap: RoadSnap
  distances: RoadDistances
  request: Parameters<RoadDistances>[2]
}): Promise<RoadPoint | null> {
  const seen = new Set<string>()
  for (const points of searchRounds(place)) {
    const roads = await snap(points, { ...request, radiusMeters: POINT_SNAP_RADIUS_M })
    const candidates: RoadPoint[] = []
    for (const road of roads) {
      if (!road) continue
      const key = `${road.at.lat.toFixed(6)},${road.at.lon.toFixed(6)}`
      const distanceMeters = Math.round(haversineMeters(place, road.at))
      if (seen.has(key) || distanceMeters > FARTHEST_M) continue
      seen.add(key)
      candidates.push({ ...road, distanceMeters })
    }
    if (candidates.length === 0) continue
    candidates.sort((a, b) => a.distanceMeters - b.distanceMeters)
    candidates.splice(MAX_LOCATIONS_PER_REQUEST - 1)

    // Index 0 is the other place; both ways, since a lorry also has to drive off again.
    const pairs = candidates.flatMap((_, i) => [[0, i + 1] as const, [i + 1, 0] as const])
    const found = await distances([other, ...candidates.map((c) => c.at)], pairs, request)
    const road = candidates.find((_, i) => found.get(pairKey(0, i + 1)) != null && found.get(pairKey(i + 1, 0)) != null)
    if (road) return road
  }
  return null
}
