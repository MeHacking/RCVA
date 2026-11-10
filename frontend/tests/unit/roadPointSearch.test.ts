import { describe, expect, it } from 'vitest'
import { haversineMeters, type LatLon } from '../../src/domain/optimization/distance'
import { MAX_LOCATIONS_PER_REQUEST, pairKey, type RoadDistances, type RoadSnap } from '../../src/api/local/openRouteService'
import { findReachablePoint, pointsAround, POINT_SNAP_RADIUS_M } from '../../src/api/local/roadPointSearch'

const PLACE = { lat: 59.91, lon: 10.75 }
const OTHER = { lat: 58, lon: 12 }
const REQUEST = { apiKey: 'test-kljuc', profile: 'driving-hgv' as const }
const fromPlace = (p: LatLon) => haversineMeters(PLACE, p)

/** Every point is on a road where it is. */
const onTheSpot: RoadSnap = async (points) => points.map((at) => ({ at, distanceMeters: 0, street: null }))

/** `open(point, to)`: is there a road from point to point. */
function matrix(open: (from: LatLon, to: LatLon) => boolean) {
  const calls: { points: LatLon[]; pairs: ReadonlyArray<readonly [number, number]> }[] = []
  const distances: RoadDistances = async (points, pairs) => {
    calls.push({ points, pairs })
    return new Map(pairs.map(([a, b]) => [pairKey(a, b), open(points[a], points[b]) ? 1000 : null]))
  }
  return { distances, calls }
}

const search = (snap: RoadSnap, distances: RoadDistances) =>
  findReachablePoint({ place: PLACE, other: OTHER, radiusMeters: 5000, snap, distances, request: REQUEST })

describe('pointsAround', () => {
  it('starts at the place and goes around it, nearest first, up to the radius', () => {
    const points = pointsAround(PLACE)
    expect(points[0]).toEqual(PLACE)
    const meters = points.map(fromPlace)
    const rings = meters.map((m) => Math.round(m / 50))
    expect(rings).toEqual([...rings].sort((a, b) => a - b))
    for (const [i, expected] of [[1, 250], [7, 500], [13, 1000], [43, 5000]]) expect(meters[i]).toBeCloseTo(expected, -1)
    expect(new Set(points.map((p) => `${p.lat},${p.lon}`)).size).toBe(points.length)
  })

  it('leaves room in one matrix request for the other place', () => {
    expect(pointsAround(PLACE)).toHaveLength(MAX_LOCATIONS_PER_REQUEST - 1)
  })
})

describe('findReachablePoint', () => {
  it('passes over the place and the near roads no lorry reaches, for the nearest one it does', async () => {
    // The zone closed to lorries: everything nearer than 900 m to the place.
    const free = (p: LatLon) => p === OTHER || fromPlace(p) > 900
    const { distances } = matrix((a, b) => free(a) && free(b))
    const found = await search(onTheSpot, distances)
    expect(found!.distanceMeters).toBe(1000)
    expect(found!.at).toEqual(pointsAround(PLACE)[13])
  })

  it('takes the nearest, in whatever order the roads came', async () => {
    const backwards: RoadSnap = async (points) => [...points].reverse().map((at) => ({ at, distanceMeters: 0, street: null }))
    const free = (p: LatLon) => p === OTHER || fromPlace(p) > 900
    const { distances } = matrix((a, b) => free(a) && free(b))
    expect((await search(backwards, distances))!.distanceMeters).toBe(1000)
  })

  it('wants the road both ways', async () => {
    const free = (p: LatLon) => fromPlace(p) > 900
    const { distances } = matrix((a, b) => (a === OTHER ? true : b === OTHER && free(a)))
    expect((await search(onTheSpot, distances))!.distanceMeters).toBe(1000)
  })

  it('gives the place itself when a lorry does reach it', async () => {
    const { distances } = matrix(() => true)
    expect(await search(onTheSpot, distances)).toEqual({ at: PLACE, distanceMeters: 0, street: null })
  })

  it('puts the points on the roads first, keeps the street, and asks about each road once', async () => {
    const road = { lat: 59.92, lon: 10.75 }
    const asked: Parameters<RoadSnap>[1][] = []
    const snap: RoadSnap = async (points, request) => {
      asked.push(request)
      return points.map(() => ({ at: road, distanceMeters: 40, street: 'Teretna ulica' }))
    }
    const { distances, calls } = matrix(() => true)
    expect(await search(snap, distances)).toEqual({ at: road, distanceMeters: Math.round(fromPlace(road)), street: 'Teretna ulica' })
    expect(asked).toEqual([{ ...REQUEST, radiusMeters: POINT_SNAP_RADIUS_M }])
    expect(calls).toEqual([{ points: [OTHER, road], pairs: [[0, 1], [1, 0]] }])
  })

  it('does not go farther than the radius', async () => {
    const far = { lat: 60, lon: 10.75 }
    const snap: RoadSnap = async (points) => points.map(() => ({ at: far, distanceMeters: 900, street: null }))
    const { distances, calls } = matrix(() => true)
    expect(await search(snap, distances)).toBeNull()
    expect(calls).toEqual([])
  })

  it('finds nothing when no point has a road, or no road is reached', async () => {
    const { distances, calls } = matrix(() => true)
    expect(await search(async (points) => points.map(() => null), distances)).toBeNull()
    expect(calls).toEqual([])
    expect(await search(onTheSpot, matrix(() => false).distances)).toBeNull()
  })
})
