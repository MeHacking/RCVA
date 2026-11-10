import { describe, expect, it } from 'vitest'
import { haversineMeters, type LatLon } from '../../src/domain/optimization/distance'
import { MAX_LOCATIONS_PER_REQUEST, pairKey, type RoadDistances, type RoadSnap } from '../../src/api/local/openRouteService'
import { findReachablePoint, pointsAround, pointsOnFarRing, POINT_SNAP_RADIUS_M } from '../../src/api/local/roadPointSearch'

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

const search = (snap: RoadSnap, distances: RoadDistances, others: LatLon[] = [OTHER]) =>
  findReachablePoint({ place: PLACE, others, snap, distances, request: REQUEST })

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
    const ring = pointsOnFarRing(PLACE, 8000)
    for (const point of ring) expect(Math.round(fromPlace(point) / 50)).toBe(160)
  })

  it('fit in one matrix request, each round, with the other places', () => {
    expect(pointsAround(PLACE).length).toBeLessThanOrEqual(MAX_LOCATIONS_PER_REQUEST - 1)
    expect(pointsOnFarRing(PLACE, 10_000).length).toBeLessThanOrEqual(MAX_LOCATIONS_PER_REQUEST - 3)
  })
})

describe('findReachablePoint', () => {
  it('passes over the place and the near roads no lorry reaches, for the nearest one it does', async () => {
    const { road } = await search(onTheSpot, matrix(closedWithin(900)).distances)
    expect(road!.distanceMeters).toBe(1000)
    expect(road!.at).toEqual(pointsAround(PLACE)[13])
  })

  it('stops at the first radius where something is found', async () => {
    const { distances, calls } = matrix(closedWithin(900))
    await search(onTheSpot, distances)
    expect(calls).toHaveLength(1)
  })

  it('goes one kilometre farther each time nothing is found', async () => {
    const asked: number[] = []
    const snap: RoadSnap = async (points, request) => {
      asked.push(points.length)
      return onTheSpot(points, request)
    }
    const { distances, calls } = matrix(closedWithin(7500))
    const { road } = await search(snap, distances)
    expect(Math.round(road!.distanceMeters / 50)).toBe(160)
    expect(calls).toHaveLength(4) // 5, 6, 7 and 8 km
    expect(asked).toEqual([50, 36, 36, 36]) // the other place only the first time
  })

  it('gives up after 10 km, saying how many points on roads it checked', async () => {
    const { distances, calls } = matrix(() => false)
    const result = await search(onTheSpot, distances)
    expect(result).toEqual({ road: null, tried: 49 + 5 * 36 })
    expect(calls).toHaveLength(6)
    const last = calls.at(-1)!.points.at(-1)!
    expect(Math.round(fromPlace(last) / 50)).toBe(200)
  })

  it('takes the nearest, in whatever order the roads came', async () => {
    // Only the points around the place are turned around: the other place stays last.
    const backwards: RoadSnap = async (points) => {
      const around = points.slice(0, 49).reverse()
      return [...around, ...points.slice(49)].map((at) => ({ at, distanceMeters: 0, street: null }))
    }
    expect((await search(backwards, matrix(closedWithin(900)).distances)).road!.distanceMeters).toBe(1000)
  })

  it('wants the road both ways', async () => {
    const { distances } = matrix((a, b) => (a === OTHER ? true : b === OTHER && fromPlace(a) > 900))
    expect((await search(onTheSpot, distances)).road!.distanceMeters).toBe(1000)
  })

  it('is content with one of the other places, when another is cut off itself', async () => {
    const island = { lat: 57, lon: 11 }
    const open = (a: LatLon, b: LatLon) => a.lat !== island.lat && b.lat !== island.lat && closedWithin(900)(a, b)
    const { road } = await search(onTheSpot, matrix(open).distances, [island, OTHER])
    expect(road!.distanceMeters).toBe(1000)
  })

  it('puts the other places on the roads, and leaves out one without a road', async () => {
    const onRoad = { lat: 58.001, lon: 12.001 }
    const lost = { lat: 57, lon: 11 }
    const snap: RoadSnap = async (points) =>
      points.map((at) =>
        at === OTHER ? { at: onRoad, distanceMeters: 90, street: null } : at === lost ? null : { at, distanceMeters: 0, street: null },
      )
    const { distances, calls } = matrix(() => true)
    await search(snap, distances, [lost, OTHER])
    expect(calls[0].points[0]).toEqual(onRoad)
    expect(calls[0].points[1]).toEqual(PLACE)
  })

  it('gives the place itself when a lorry does reach it', async () => {
    expect((await search(onTheSpot, matrix(() => true).distances)).road).toEqual({ at: PLACE, distanceMeters: 0, street: null })
  })

  it('puts the points on the roads first, keeps the street, and asks about each road once', async () => {
    const road = { lat: 59.92, lon: 10.75 }
    const asked: Parameters<RoadSnap>[1][] = []
    const snap: RoadSnap = async (points, request) => {
      asked.push(request)
      return points.map((p) => (p === OTHER ? { at: OTHER, distanceMeters: 0, street: null } : { at: road, distanceMeters: 40, street: 'Teretna ulica' }))
    }
    const { distances, calls } = matrix(() => true)
    expect(await search(snap, distances)).toEqual({
      road: { at: road, distanceMeters: Math.round(fromPlace(road)), street: 'Teretna ulica' },
      tried: 1,
    })
    expect(asked).toEqual([{ ...REQUEST, radiusMeters: POINT_SNAP_RADIUS_M }])
    expect(calls).toEqual([{ points: [OTHER, road], pairs: [[0, 1], [1, 0]] }])
  })

  it('does not check a road twice when a wider circle lands on it again', async () => {
    const road = { lat: 59.92, lon: 10.75 }
    const snap: RoadSnap = async (points) => points.map((p) => (p === OTHER ? { at: OTHER, distanceMeters: 0, street: null } : { at: road, distanceMeters: 40, street: null }))
    const { distances, calls } = matrix(() => false)
    expect(await search(snap, distances)).toEqual({ road: null, tried: 1 })
    expect(calls).toHaveLength(1)
  })

  it('does not go farther than the last radius', async () => {
    const far = { lat: 60.1, lon: 10.75 }
    const snap: RoadSnap = async (points) => points.map((p) => (p === OTHER ? { at: OTHER, distanceMeters: 0, street: null } : { at: far, distanceMeters: 900, street: null }))
    const { distances, calls } = matrix(() => true)
    expect((await search(snap, distances)).road).toBeNull()
    expect(calls).toEqual([])
  })

  it('finds nothing without other places, or when none of them has a road', async () => {
    const { distances, calls } = matrix(() => true)
    expect(await search(onTheSpot, distances, [])).toEqual({ road: null, tried: 0 })
    expect(await search(async (points) => points.map(() => null), distances)).toEqual({ road: null, tried: 0 })
    expect(calls).toEqual([])
  })
})
