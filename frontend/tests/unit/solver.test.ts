import { describe, expect, it } from 'vitest'
import { compareScores, scoreOf, solve, type SolverInput, type SolverResult } from '../../src/domain/optimization/solver'
import { SeededRandom } from '../../src/domain/optimization/random'
import { bruteForceScore, smallRandomInput, test7Input } from './solverCases'

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
})

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
