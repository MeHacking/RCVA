import { describe, expect, it } from 'vitest'
import {
  baseRules,
  EXACT_LIMIT,
  OPEN_ROUTE_REAR_LOADING,
  RoutePlanner,
  type Route,
  type RouteRules,
} from '../../src/domain/optimization/routePlanner'
import { SeededRandom } from '../../src/domain/optimization/random'

// The base-rule cases are the same as backend/src/test/java/rs/rcva/optimization/routing/RoutePlannerTest.java.

function planarDistance(xy: number[][]): number[][] {
  return xy.map(([ax, ay]) => xy.map(([bx, by]) => Math.round(Math.hypot(ax - bx, ay - by) * 1000)))
}

/** Random planar points (km); location 0 is the base, then a pickup and a delivery per shipment. */
function randomInstance(random: SeededRandom, shipments: number) {
  const xy = Array.from({ length: 1 + 2 * shipments }, () => [random.nextInt(1000), random.nextInt(1000)])
  const indices = range(shipments)
  return {
    distance: planarDistance(xy),
    pickupLocation: indices.map((s) => 1 + 2 * s),
    deliveryLocation: indices.map((s) => 2 + 2 * s),
  }
}

/**
 * Few warehouses and delivery places shared by the shipments (location 0 is the base,
 * 1-3 warehouses, 4-7 delivery places), so stops with several shipments are common.
 */
function sharedInstance(random: SeededRandom, shipments: number) {
  const xy = Array.from({ length: 8 }, () => [random.nextInt(1000), random.nextInt(1000)])
  const indices = range(shipments)
  return {
    distance: planarDistance(xy),
    pickupLocation: indices.map(() => 1 + random.nextInt(3)),
    deliveryLocation: indices.map(() => 4 + random.nextInt(4)),
  }
}

const RULES: RouteRules[] = [
  baseRules(0, true),
  baseRules(0, false),
  OPEN_ROUTE_REAR_LOADING,
  { start: null, end: null, lifo: false },
  { start: 0, end: null, lifo: true },
]

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  )
}

/** Stop number of each shipment: consecutive shipments at the same location share a stop. */
function stops(order: number[], location: number[]): Map<number, number> {
  const stop = new Map<number, number>()
  order.forEach((s, i) => {
    const same = i > 0 && location[order[i - 1]] === location[s]
    stop.set(s, i === 0 ? 0 : stop.get(order[i - 1])! + (same ? 0 : 1))
  })
  return stop
}

/** Rear loading, checked pair by pair: picked up at an earlier stop, never delivered at an earlier one. */
function respectsRearLoading(route: { pickups: number[]; deliveries: number[] }, pickupLocation: number[], deliveryLocation: number[]) {
  const pickupStop = stops(route.pickups, pickupLocation)
  const deliveryStop = stops(route.deliveries, deliveryLocation)
  return route.pickups.every((a) =>
    route.pickups.every((b) => !(pickupStop.get(a)! < pickupStop.get(b)! && deliveryStop.get(a)! < deliveryStop.get(b)!)),
  )
}

/** Shortest route over every order of pickups and of deliveries that the rules allow. */
function bruteForce(planner: RoutePlanner, instance: { pickupLocation: number[]; deliveryLocation: number[] }, rules: RouteRules, shipments: number[]): number {
  let best = Infinity
  for (const pickups of permutations(shipments)) {
    for (const deliveries of permutations(shipments)) {
      if (rules.lifo && !respectsRearLoading({ pickups, deliveries }, instance.pickupLocation, instance.deliveryLocation)) continue
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
      const instance = randomInstance(random, n)
      const rules = baseRules(0, round % 2 === 0)
      const planner = new RoutePlanner({ ...instance, ...rules })
      const shipments = range(n)

      const route = planner.plan(shipments)
      expectAnOrderOf(route, shipments)
      expect(planner.length(route.pickups, route.deliveries)).toBe(route.meters)
      expect(route.meters, `round ${round}`).toBe(bruteForce(planner, instance, rules, shipments))
      expect(planner.meters(shipments)).toBe(route.meters)
    }
  })

  it.each(RULES.map((rules) => [JSON.stringify(rules), rules] as const))(
    'finds the shortest order like brute force, with shared stops (%s)',
    (_, rules) => {
      const random = new SeededRandom(17)
      for (let round = 0; round < 60; round++) {
        const n = 1 + (round % 5)
        const instance = round % 2 === 0 ? sharedInstance(random, n) : randomInstance(random, n)
        const planner = new RoutePlanner({ ...instance, ...rules })
        const shipments = range(n)

        const route = planner.plan(shipments)
        expectAnOrderOf(route, shipments)
        if (rules.lifo) expect(respectsRearLoading(route, instance.pickupLocation, instance.deliveryLocation)).toBe(true)
        expect(planner.length(route.pickups, route.deliveries)).toBe(route.meters)
        expect(route.meters, `round ${round}`).toBe(bruteForce(planner, instance, rules, shipments))
      }
    },
  )

  it.each(RULES.map((rules) => [JSON.stringify(rules), rules] as const))(
    'gives a valid heuristic order not far from the exact one (%s)',
    (_, rules) => {
      const random = new SeededRandom(11)
      for (let round = 0; round < 20; round++) {
        const instance = round % 2 === 0 ? sharedInstance(random, 8) : randomInstance(random, 8)
        const shipments = range(8)
        const exact = new RoutePlanner({ ...instance, ...rules }, EXACT_LIMIT).plan(shipments).meters
        const heuristic = new RoutePlanner({ ...instance, ...rules }, 0)
        const route = heuristic.plan(shipments)

        expectAnOrderOf(route, shipments)
        if (rules.lifo) expect(respectsRearLoading(route, instance.pickupLocation, instance.deliveryLocation)).toBe(true)
        expect(heuristic.length(route.pickups, route.deliveries)).toBe(route.meters)
        expect(route.meters).toBeGreaterThanOrEqual(exact)
        expect(route.meters, `round ${round}`).toBeLessThanOrEqual(Math.floor((exact * 13) / 10))
      }
    },
  )

  it('gives an empty route no length', () => {
    for (const rules of RULES) {
      const planner = new RoutePlanner({ ...randomInstance(new SeededRandom(1), 2), ...rules })
      expect(planner.plan([]).meters).toBe(0)
      expect(planner.meters([])).toBe(0)
    }
  })

  // Test 7 geometry (km): S1 (-50,0)->(100,0) and S3 (50,0)->(-100,0), base (0,0).
  const test7 = {
    distance: planarDistance([[0, 0], [-50, 0], [100, 0], [50, 0], [-100, 0]]),
    pickupLocation: [1, 3],
    deliveryLocation: [2, 4],
  }

  it('orders the test 7 route of S1 and S3', () => {
    const route = new RoutePlanner({ ...test7, ...baseRules(0, true) }).plan([0, 1])
    expect(route.meters).toBe(500_000)
    // The mirror image (S3 first, then S1) is just as long; both are optimal.
    expect([[0, 1, 0, 1], [1, 0, 1, 0]]).toContainEqual([...route.pickups, ...route.deliveries])
  })

  it('orders S1 and S3 of test 7 on an open route, loaded from the rear', () => {
    // Free loading: S1, S3, then S1 at (100,0), S3 at (-100,0): 100 + 50 + 200 = 350 km.
    expect(new RoutePlanner({ ...test7, start: null, end: null, lifo: false }).meters([0, 1])).toBe(350_000)
    // From the rear: what is picked up last is delivered first, 100 + 150 + 200 = 450 km.
    const route = new RoutePlanner({ ...test7, ...OPEN_ROUTE_REAR_LOADING }).plan([0, 1])
    expect(route.meters).toBe(450_000)
    expect([[0, 1, 1, 0], [1, 0, 0, 1]]).toContainEqual([...route.pickups, ...route.deliveries])
  })

  it('gives the same length whatever the order of the argument, from the cache', () => {
    for (const rules of RULES) {
      const planner = new RoutePlanner({ ...randomInstance(new SeededRandom(3), 6), ...rules })
      expect(planner.meters([5, 0, 3, 1])).toBe(planner.plan([0, 1, 3, 5]).meters)
      expect(planner.meters([1, 3, 5, 0])).toBe(planner.meters([0, 1, 3, 5]))
    }
  })
})
