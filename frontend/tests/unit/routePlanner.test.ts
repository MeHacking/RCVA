import { describe, expect, it } from 'vitest'
import { EXACT_LIMIT, RoutePlanner, type Route } from '../../src/domain/optimization/routePlanner'
import { SeededRandom } from '../../src/domain/optimization/random'

// Same cases as backend/src/test/java/rs/rcva/optimization/routing/RoutePlannerTest.java.

function planarDistance(xy: number[][]): number[][] {
  return xy.map(([ax, ay]) => xy.map(([bx, by]) => Math.round(Math.hypot(ax - bx, ay - by) * 1000)))
}

/** Random planar points (km); location 0 is the base, then a pickup and a delivery per shipment. */
function randomInstance(random: SeededRandom, shipments: number) {
  const xy = Array.from({ length: 1 + 2 * shipments }, () => [random.nextInt(1000), random.nextInt(1000)])
  const indices = range(shipments)
  return {
    distance: planarDistance(xy),
    base: 0,
    pickupLocation: indices.map((s) => 1 + 2 * s),
    deliveryLocation: indices.map((s) => 2 + 2 * s),
  }
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  )
}

function bruteForce(planner: RoutePlanner, shipments: number[]): number {
  let best = Infinity
  for (const pickups of permutations(shipments)) {
    for (const deliveries of permutations(shipments)) {
      best = Math.min(best, planner.length(pickups, deliveries))
    }
  }
  return best
}

function expectAnOrderOf(route: Route, shipments: number[]) {
  const sorted = [...shipments].sort((a, b) => a - b)
  expect([...route.pickups].sort((a, b) => a - b)).toEqual(sorted)
  expect([...route.deliveries].sort((a, b) => a - b)).toEqual(sorted)
}

describe('RoutePlanner', () => {
  it('finds the shortest two-phase order like brute force', () => {
    const random = new SeededRandom(7)
    for (let round = 0; round < 40; round++) {
      const n = 1 + (round % 5)
      const planner = new RoutePlanner({ ...randomInstance(random, n), returnToBase: round % 2 === 0 })
      const shipments = range(n)

      const route = planner.plan(shipments)
      expectAnOrderOf(route, shipments)
      expect(planner.length(route.pickups, route.deliveries)).toBe(route.meters)
      expect(route.meters, `round ${round}`).toBe(bruteForce(planner, shipments))
      expect(planner.meters(shipments)).toBe(route.meters)
    }
  })

  it('gives a valid heuristic order not far from the exact one', () => {
    const random = new SeededRandom(11)
    for (let round = 0; round < 20; round++) {
      const instance = { ...randomInstance(random, 8), returnToBase: true }
      const shipments = range(8)
      const exact = new RoutePlanner(instance, EXACT_LIMIT).plan(shipments).meters
      const heuristic = new RoutePlanner(instance, 0)
      const route = heuristic.plan(shipments)

      expectAnOrderOf(route, shipments)
      expect(heuristic.length(route.pickups, route.deliveries)).toBe(route.meters)
      expect(route.meters).toBeGreaterThanOrEqual(exact)
      expect(route.meters).toBeLessThanOrEqual(Math.floor((exact * 13) / 10))
    }
  })

  it('gives an empty route no length', () => {
    const planner = new RoutePlanner({ ...randomInstance(new SeededRandom(1), 2), returnToBase: true })
    expect(planner.plan([]).meters).toBe(0)
    expect(planner.meters([])).toBe(0)
  })

  it('orders the test 7 route of S1 and S3', () => {
    // Test 7 geometry (km): S1 (-50,0)->(100,0) and S3 (50,0)->(-100,0), base (0,0).
    const distance = planarDistance([[0, 0], [-50, 0], [100, 0], [50, 0], [-100, 0]])
    const planner = new RoutePlanner({
      distance,
      base: 0,
      returnToBase: true,
      pickupLocation: [1, 3],
      deliveryLocation: [2, 4],
    })
    const route = planner.plan([0, 1])
    expect(route.meters).toBe(500_000)
    // The mirror image (S3 first, then S1) is just as long; both are optimal.
    expect([[0, 1, 0, 1], [1, 0, 1, 0]]).toContainEqual([...route.pickups, ...route.deliveries])
  })

  it('gives the same length whatever the order of the argument, from the cache', () => {
    const planner = new RoutePlanner({ ...randomInstance(new SeededRandom(3), 6), returnToBase: false })
    expect(planner.meters([5, 0, 3, 1])).toBe(planner.plan([0, 1, 3, 5]).meters)
    expect(planner.meters([1, 3, 5, 0])).toBe(planner.meters([0, 1, 3, 5]))
  })
})
