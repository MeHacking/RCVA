import { describe, expect, it } from 'vitest'
import { compareScores, scoreOf, solve, type SolverInput, type SolverResult } from '../../src/domain/optimization/solver'
import { OPEN_ROUTE_REAR_LOADING } from '../../src/domain/optimization/routePlanner'
import { SeededRandom } from '../../src/domain/optimization/random'
import { standardFleet } from '../../src/domain/fleet'
import { bruteForceScore, smallOpenInput, smallRandomInput, test7Input } from './solverCases'

/** Test 7 with the process owner's rules; S1 and S2 weigh 8 t, S3 and S4 6 t. */
function heavyTest7(capacityKg: number): SolverInput {
  const input = test7Input(OPEN_ROUTE_REAR_LOADING)
  input.shipments.forEach((s, i) => (s.weightKg = i < 2 ? 8000 : 6000))
  input.trucks.forEach((t) => (t.capacityKg = capacityKg))
  return input
}

function expectConsistent(input: SolverInput, result: SolverResult) {
  const onTrucks = result.routes.flatMap((r) => r.shipments).sort((a, b) => a - b)
  expect(onTrucks).toEqual(input.shipments.map((_, s) => s))
  for (const route of result.routes) {
    expect([...route.route.pickups].sort((a, b) => a - b)).toEqual(route.shipments)
    expect([...route.route.deliveries].sort((a, b) => a - b)).toEqual(route.shipments)
  }
  expect(scoreOf(input, result.truckOfShipment)).toEqual(result.score)
  expect(-result.score.medium).toBe(result.routes.length)
  expect(-result.score.soft).toBe(result.routes.reduce((sum, r) => sum + r.route.meters, 0))
}

describe('solver score', () => {
  it('puts fewer trucks before fewer metres (test 7)', () => {
    const input = test7Input()
    // S1+S3, S2+S4 on two trucks; S3+S4, S1, S2 on three.
    const twoTrucks = scoreOf(input, [0, 1, 0, 1])
    const threeTrucks = scoreOf(input, [1, 2, 0, 0])

    expect(twoTrucks).toEqual({ hard: 0, medium: -2, soft: -1_001_489 })
    expect(threeTrucks).toEqual({ hard: 0, medium: -3, soft: -921_489 })
    expect(compareScores(twoTrucks, threeTrucks)).toBeGreaterThan(0)
  })

  it('counts LDM over capacity as hard', () => {
    // S1+S2 = 12,0 LDM on a 10,0 truck
    expect(scoreOf(test7Input(), [0, 0, 1, 1]).hard).toBe(-20)
  })

  it('puts fewer trucks first on an open route loaded from the rear too (test 7)', () => {
    const input = test7Input(OPEN_ROUTE_REAR_LOADING)
    // S1+S3: S1, S3, then S3 (-100,0), S1 (100,0): 100 + 150 + 200 km; S2+S4 the same.
    const twoTrucks = scoreOf(input, [0, 1, 0, 1])
    // S3+S4: 10 + 150 + 10 km; S1 and S2 150 km each.
    const threeTrucks = scoreOf(input, [1, 2, 0, 0])

    expect(twoTrucks).toEqual({ hard: 0, medium: -2, soft: -900_000 })
    expect(threeTrucks).toEqual({ hard: 0, medium: -3, soft: -470_000 })
    expect(compareScores(twoTrucks, threeTrucks)).toBeGreaterThan(0)
  })

  it('counts kilograms over capacity as hard', () => {
    // S1+S3 and S2+S4 weigh 14 t each on 13 t trucks
    expect(scoreOf(heavyTest7(13_000), [0, 1, 0, 1])).toEqual({ hard: -2000, medium: -2, soft: -900_000 })
    expect(scoreOf(heavyTest7(14_000), [0, 1, 0, 1]).hard).toBe(0)
  })
})

// Fixed step limits: the outcome does not depend on speed, only the time does (all test files run at once).
const BRUTE_FORCE_TIMEOUT_MS = 30_000

describe('solve', () => {
  it.each([1, 2, 3, 4, 5])('finds test 7: 2 trucks, 1 001 489 m (seed %i)', (seed) => {
    const input = test7Input()
    const result = solve(input, { seed, stepLimit: 2000 })

    expect(result.score).toEqual({ hard: 0, medium: -2, soft: -1_001_489 })
    expectConsistent(input, result)
  })

  it('finds the optimum of small random instances, as trying every assignment does', () => {
    const random = new SeededRandom(42)
    for (let round = 0; round < 60; round++) {
      const input = smallRandomInput(random, 3 + (round % 5), 4)
      const result = solve(input, { seed: round, stepLimit: 3000 })

      expect(result.score, `round ${round}`).toEqual(bruteForceScore(input))
      expectConsistent(input, result)
    }
  }, BRUTE_FORCE_TIMEOUT_MS)

  it.each([1, 2, 3])('finds test 7 on an open route loaded from the rear: 2 trucks, 900 000 m (seed %i)', (seed) => {
    const input = test7Input(OPEN_ROUTE_REAR_LOADING)
    const result = solve(input, { seed, stepLimit: 2000 })

    expect(result.score).toEqual({ hard: 0, medium: -2, soft: -900_000 })
    expectConsistent(input, result)
  })

  it.each([1, 2, 3])('takes a third truck when weight does not allow two (seed %i)', (seed) => {
    const input = heavyTest7(13_000)
    const result = solve(input, { seed, stepLimit: 2000 })

    // S1 and S2 alone, S3+S4 (12 t) together
    expect(result.score).toEqual({ hard: 0, medium: -3, soft: -470_000 })
    expect(result.truckOfShipment[2]).toBe(result.truckOfShipment[3])
    expectConsistent(input, result)
  })

  it('finds the optimum of small open-route instances with weight, as trying every assignment does', () => {
    const random = new SeededRandom(43)
    for (let round = 0; round < 60; round++) {
      const input = smallOpenInput(random, 3 + (round % 5), 4)
      const result = solve(input, { seed: round, stepLimit: 3000 })

      expect(result.score, `round ${round}`).toEqual(bruteForceScore(input))
      expectConsistent(input, result)
    }
  }, BRUTE_FORCE_TIMEOUT_MS)

  it('uses as few trucks of a standard fleet as LDM and weight allow', () => {
    // 6 shipments of 4,0 LDM and 9 t: 13,6 LDM takes 3 per truck, but 24 t only 2
    const input: SolverInput = {
      ...test7Input(OPEN_ROUTE_REAR_LOADING),
      shipments: [1, 3, 5, 7, 1, 3].map((pickup) => ({ ldmTenths: 40, weightKg: 9000, pickup, delivery: pickup + 1 })),
      trucks: standardFleet(6),
    }
    const result = solve(input, { seed: 1, stepLimit: 3000 })

    expect(result.score.hard).toBe(0)
    expect(result.score.medium).toBe(-3)
    expect(result.score).toEqual(bruteForceScore({ ...input, trucks: standardFleet(3) }))
    expectConsistent(input, result)
  })

  it('reports a shipment larger than every truck as hard', () => {
    const input = test7Input()
    input.shipments[0].ldmTenths = 120
    const result = solve(input, { stepLimit: 500 })

    expect(result.score.hard).toBe(-20)
    expectConsistent(input, result)
  })

  it('gives the same result for the same seed', () => {
    const input = smallRandomInput(new SeededRandom(5), 8, 5)
    expect(solve(input, { seed: 9, stepLimit: 2000 })).toEqual(solve(input, { seed: 9, stepLimit: 2000 }))
  })

  it('needs a limit and handles an empty plan', () => {
    expect(() => solve(test7Input())).toThrow()
    const empty = { ...test7Input(), shipments: [] }
    expect(solve(empty, { stepLimit: 10 }).routes).toEqual([])
  })
})

// Options for the application on the device (NOT IN SPEC v2): where each truck is now,
// shipments left out when the trucks are not enough, and "one more truck" for comparison.
describe('solver options', () => {
  it('adds the leg from where a truck is to its first pickup', () => {
    const input = test7Input(OPEN_ROUTE_REAR_LOADING)
    expect(scoreOf(input, [0, 1, 0, 1]).soft).toBe(-900_000)
    // Truck 1 starts at the base (0, 0): 50 km to S1 or S3, whichever it picks up first.
    input.trucks[0].start = 0
    expect(scoreOf(input, [0, 1, 0, 1])).toEqual({ hard: 0, medium: -2, soft: -950_000 })
  })

  it('gives a shipment to the truck that is nearer', () => {
    const input = test7Input(OPEN_ROUTE_REAR_LOADING)
    input.shipments = [input.shipments[0]] // S1: (-50, 0) to (100, 0)
    // Truck 1 is at (100, 10), about 150 km away; truck 2 at (-100, 0), 50 km away.
    input.trucks = [
      { id: 1, capacityLdmTenths: 100, capacityKg: Infinity, start: 4 },
      { id: 2, capacityLdmTenths: 100, capacityKg: Infinity, start: 6 },
    ]
    const result = solve(input, { seed: 1, stepLimit: 500 })
    expect(result.routes.map((r) => r.truckId)).toEqual([2])
    expect(result.score).toEqual({ hard: 0, medium: -1, soft: -200_000 })
  })

  it('leaves out as little LDM as it can when the trucks are not enough, and overloads nothing', () => {
    const input = test7Input(OPEN_ROUTE_REAR_LOADING) // 6,0 + 6,0 + 4,0 + 4,0 LDM
    input.trucks = [{ id: 1, capacityLdmTenths: 100, capacityKg: Infinity }]
    expect(solve(input, { seed: 1, stepLimit: 500 }).score.hard).toBeLessThan(0)

    const result = solve({ ...input, allowUnassigned: true }, { seed: 1, stepLimit: 2000 })
    // 6,0 + 4,0 fill the truck; 10,0 LDM stay out (each tenth weighs more than the two trucks).
    expect(result.score.hard).toBe(0)
    expect(result.score.medium).toBe(-(100 * 2 + 1))
    expect(result.unassigned).toHaveLength(2)
    expect(result.unassigned.reduce((sum, s) => sum + input.shipments[s].ldmTenths, 0)).toBe(100)
    expect(result.routes[0].shipments).toHaveLength(2)
    expect(scoreOf({ ...input, allowUnassigned: true }, result.truckOfShipment)).toEqual(result.score)
  })

  it('leaves nothing out when everything fits', () => {
    const input = { ...test7Input(OPEN_ROUTE_REAR_LOADING), allowUnassigned: true }
    const result = solve(input, { seed: 1, stepLimit: 2000 })
    expect(result.unassigned).toEqual([])
    expect(result.score).toEqual({ hard: 0, medium: -2, soft: -900_000 })
  })

  it('lets metres decide up to the free trucks (test 7: 3 trucks, 470 km instead of 2 trucks, 900 km)', () => {
    const input = { ...test7Input(OPEN_ROUTE_REAR_LOADING), freeTrucks: 3 }
    const result = solve(input, { seed: 1, stepLimit: 3000 })
    expect(result.routes).toHaveLength(3)
    expect(result.score).toEqual({ hard: 0, medium: 0, soft: -470_000 })
    // A fourth truck still costs a point.
    expect(scoreOf({ ...input, freeTrucks: 2 }, result.truckOfShipment).medium).toBe(-1)
  })
})

describe('solver option exactTrucks', () => {
  it('finds the shortest routes on exactly that many trucks, also when fewer would be shorter', () => {
    // Trucks 1 to 3 are at the base; truck 4 (a standard 13,6 LDM) is nowhere yet, as the extra truck of the advice.
    const input = test7Input(OPEN_ROUTE_REAR_LOADING)
    input.trucks = [1, 2, 3].map((id) => ({ id, capacityLdmTenths: 100, capacityKg: Infinity, start: 0 }))
    input.trucks.push({ id: 4, capacityLdmTenths: 136, capacityKg: Infinity, start: null })
    // Truck 4 takes S1+S2 (170 km), truck 1 S3+S4 from the base (220 km): two trucks, 390 km.
    const replacing = [3, 3, 0, 0]
    expect(scoreOf({ ...input, freeTrucks: 3 }, replacing)).toEqual({ hard: 0, medium: 0, soft: -390_000 })
    // On exactly three trucks the same costs a point, so the extra truck must come in addition.
    expect(scoreOf({ ...input, exactTrucks: 3 }, replacing)).toEqual({ hard: 0, medium: -1, soft: -390_000 })

    const exact = solve({ ...input, exactTrucks: 3 }, { seed: 1, stepLimit: 3000 })
    expect(exact.routes).toHaveLength(3)
    expect(exact.score).toEqual({ hard: 0, medium: 0, soft: -570_000 })
    // One more than asked costs a point too.
    expect(scoreOf({ ...input, exactTrucks: 3 }, [0, 1, 2, 3]).medium).toBe(-1)
  })
})
