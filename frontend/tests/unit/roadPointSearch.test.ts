import { describe, expect, it } from 'vitest'
import { haversineMeters, type LatLon } from '../../src/domain/optimization/distance'
import { MAX_LOCATIONS_PER_REQUEST, pairKey, type RoadDistances, type RoadSnap } from '../../src/api/local/openRouteService'
import {
  findReachablePoint,
  MAX_PLACES_SEARCHED,
  placesOutOfReach,
  POINT_SNAP_RADIUS_M,
  pointsAround,
  pointsOnFarRing,
  worthSearching,
} from '../../src/api/local/roadPointSearch'

const PLACE = { lat: 59.91, lon: 10.75 }
const OTHER = { lat: 58, lon: 12 }
const REQUEST = { apiKey: 'test-kljuc', profile: 'driving-hgv' as const }
const fromPlace = (p: LatLon) => haversineMeters(PLACE, p)

/** Every point is on a road where it is. */
const onTheSpot: RoadSnap = async (points) => points.map((at) => ({ at, distanceMeters: 0, street: null }))

/** `open(from, to)`: is there a road from point to point. */
function matrix(open: (from: LatLon, to: LatLon) => boolean) {
  const calls: { points: LatLon[]; pairs: ReadonlyArray<readonly [number, number]> }[] = []
  const distances: RoadDistances = async (points, pairs) => {
    calls.push({ points, pairs })
    return new Map(pairs.map(([a, b]) => [pairKey(a, b), open(points[a], points[b]) ? 1000 : null]))
  }
  return { distances, calls }
}

const closedWithin = (meters: number) => (a: LatLon, b: LatLon) => fromPlace(a) > meters && fromPlace(b) > meters

const search = (snap: RoadSnap, distances: RoadDistances) =>
  findReachablePoint({ place: PLACE, other: OTHER, snap, distances, request: REQUEST })

describe('placesOutOfReach', () => {
  const without = (...cut: number[]) => (a: number, b: number) => !cut.includes(a) && !cut.includes(b)

  it('names nobody when every two places have a road', () => {
    expect(placesOutOfReach(5, () => true)).toEqual([])
  })

  it('names only the place with no road, not all those it has no road with', () => {
    expect(placesOutOfReach(41, without(17))).toEqual([17])
  })

  it('names a place reached only one way', () => {
    expect(placesOutOfReach(6, (_, b) => b !== 3)).toEqual([3])
    expect(placesOutOfReach(6, (a) => a !== 3)).toEqual([3])
  })

  it('names each of a few bad places', () => {
    expect(placesOutOfReach(10, without(2, 7)).sort()).toEqual([2, 7])
  })

  it('takes out the smaller of two groups with no road between them', () => {
    const group = (i: number) => (i < 30 ? 'a' : 'b')
    expect(placesOutOfReach(41, (a, b) => group(a) === group(b)).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 11 }, (_, i) => 30 + i),
    )
  })

  it('takes out one of a pair with no road between them, when the rest is connected', () => {
    expect(placesOutOfReach(5, (a, b) => !(a === 1 && b === 4) && !(a === 4 && b === 1))).toHaveLength(1)
  })
})

describe('worthSearching', () => {
  it('searches for a few places when the rest are clearly fine', () => {
    expect(worthSearching(1, 41)).toBe(true)
    expect(worthSearching(1, 3)).toBe(true)
    expect(worthSearching(MAX_PLACES_SEARCHED, 41)).toBe(true)
  })

  it('spends nothing when there is nothing to do, too many, or no clear good side', () => {
    expect(worthSearching(0, 41)).toBe(false)
    expect(worthSearching(MAX_PLACES_SEARCHED + 1, 100)).toBe(false)
    expect(worthSearching(1, 2)).toBe(false)
    expect(worthSearching(2, 4)).toBe(false)
  })
})

describe('the points around a place', () => {
  it('start at the place and go around it, nearest first, up to 5 km', () => {
    const points = pointsAround(PLACE)
    expect(points[0]).toEqual(PLACE)
    const rings = points.map((p) => Math.round(fromPlace(p) / 50))
    expect(rings).toEqual([...rings].sort((a, b) => a - b))
    expect(rings.at(-1)).toBe(100)
    expect(new Set(points.map((p) => `${p.lat},${p.lon}`)).size).toBe(points.length)
  })

  it('farther out make a ring at that distance', () => {
    for (const point of pointsOnFarRing(PLACE, 8000)) expect(Math.round(fromPlace(point) / 50)).toBe(160)
  })

  it('fit in one matrix request, each round, with the other place', () => {
    expect(pointsAround(PLACE).length).toBeLessThanOrEqual(MAX_LOCATIONS_PER_REQUEST - 1)
    expect(pointsOnFarRing(PLACE, 10_000).length).toBeLessThanOrEqual(MAX_LOCATIONS_PER_REQUEST - 1)
  })
})

describe('findReachablePoint', () => {
  it('passes over the place and the near roads no lorry reaches, for the nearest one it does', async () => {
    const road = await search(onTheSpot, matrix(closedWithin(900)).distances)
    expect(road!.distanceMeters).toBe(1000)
    expect(road!.at).toEqual(pointsAround(PLACE)[13])
  })

  it('spends two requests when the first radius is enough', async () => {
    let snaps = 0
    const snap: RoadSnap = async (points, request) => {
      snaps++
      return onTheSpot(points, request)
    }
    const { distances, calls } = matrix(closedWithin(900))
    await search(snap, distances)
    expect([snaps, calls.length]).toEqual([1, 1])
  })

  it('goes one kilometre farther each time nothing is found', async () => {
    const asked: number[] = []
    const snap: RoadSnap = async (points, request) => {
      asked.push(points.length)
      return onTheSpot(points, request)
    }
    const { distances, calls } = matrix(closedWithin(7500))
    const road = await search(snap, distances)
    expect(Math.round(road!.distanceMeters / 50)).toBe(160)
    expect(calls).toHaveLength(4) // 5, 6, 7 and 8 km
    expect(asked).toEqual([49, 36, 36, 36])
  })

  it('gives up after 10 km, having checked every ring to the end', async () => {
    const { distances, calls } = matrix(() => false)
    expect(await search(onTheSpot, distances)).toBeNull()
    expect(calls.map((c) => c.points.length - 1)).toEqual([49, 36, 36, 36, 36, 36])
    expect(Math.round(fromPlace(calls.at(-1)!.points.at(-1)!) / 50)).toBe(200)
  })

  it('takes the nearest, in whatever order the roads came', async () => {
    const backwards: RoadSnap = async (points) => [...points].reverse().map((at) => ({ at, distanceMeters: 0, street: null }))
    expect((await search(backwards, matrix(closedWithin(900)).distances))!.distanceMeters).toBe(1000)
  })

  it('wants the road both ways', async () => {
    const { distances } = matrix((a, b) => (a === OTHER ? true : b === OTHER && fromPlace(a) > 900))
    expect((await search(onTheSpot, distances))!.distanceMeters).toBe(1000)
  })

  it('gives the place itself when a lorry does reach it', async () => {
    expect(await search(onTheSpot, matrix(() => true).distances)).toEqual({ at: PLACE, distanceMeters: 0, street: null })
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

  it('spends no matrix request on roads it already checked', async () => {
    const road = { lat: 59.92, lon: 10.75 }
    const snap: RoadSnap = async (points) => points.map(() => ({ at: road, distanceMeters: 40, street: null }))
    const { distances, calls } = matrix(() => false)
    expect(await search(snap, distances)).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('does not go farther than the last radius', async () => {
    const far = { lat: 60.1, lon: 10.75 }
    const snap: RoadSnap = async (points) => points.map(() => ({ at: far, distanceMeters: 900, street: null }))
    const { distances, calls } = matrix(() => true)
    expect(await search(snap, distances)).toBeNull()
    expect(calls).toEqual([])
  })

  it('spends no matrix request when no point has a road', async () => {
    const { distances, calls } = matrix(() => true)
    expect(await search(async (points) => points.map(() => null), distances)).toBeNull()
    expect(calls).toEqual([])
  })
})
