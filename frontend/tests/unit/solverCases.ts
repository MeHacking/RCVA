import { compareScores, plannerFor, scoreOf, type Score, type SolverInput } from '../../src/domain/optimization/solver'
import { SeededRandom } from '../../src/domain/optimization/random'

// Shared by the solver tests (tests/unit) and the Timefold comparison (tests/oracle).

export function planarDistance(xy: number[][]): number[][] {
  return xy.map(([ax, ay]) => xy.map(([bx, by]) => Math.round(Math.hypot(ax - bx, ay - by) * 1000)))
}

/** Test 7 (Spec v2): 2 trucks, 1 001 489 m (S1+S3, S2+S4), although 3 trucks give 921 489 m. */
export function test7Input(): SolverInput {
  return {
    // base, S1 pickup/delivery, S2, S3, S4 (km)
    distance: planarDistance([[0, 0], [-50, 0], [100, 0], [-50, 10], [100, 10], [50, 0], [-100, 0], [50, 10], [-100, 10]]),
    base: 0,
    returnToBase: true,
    shipments: [
      { ldmTenths: 60, pickup: 1, delivery: 2 },
      { ldmTenths: 60, pickup: 3, delivery: 4 },
      { ldmTenths: 40, pickup: 5, delivery: 6 },
      { ldmTenths: 40, pickup: 7, delivery: 8 },
    ],
    trucks: [1, 2, 3, 4].map((id) => ({ id, capacityLdmTenths: 100 })),
  }
}

/** Small random instance; LDM is large next to capacity, so the number of trucks matters. */
export function smallRandomInput(random: SeededRandom, shipments: number, trucks: number): SolverInput {
  const xy = Array.from({ length: 1 + 2 * shipments }, () => [random.nextInt(1000), random.nextInt(1000)])
  return {
    distance: planarDistance(xy),
    base: 0,
    returnToBase: random.next() < 0.5,
    shipments: Array.from({ length: shipments }, (_, s) => ({
      ldmTenths: 20 + random.nextInt(60),
      pickup: 1 + 2 * s,
      delivery: 2 + 2 * s,
    })),
    trucks: Array.from({ length: trucks }, (_, t) => ({ id: t + 1, capacityLdmTenths: t % 2 === 0 ? 136 : 100 })),
  }
}

/** Best score over every assignment of shipments to trucks (trucks^shipments of them). */
export function bruteForceScore(input: SolverInput): Score {
  const planner = plannerFor(input)
  const n = input.shipments.length
  const k = input.trucks.length
  const assignment = new Array<number>(n).fill(0)
  let best: Score | null = null
  for (;;) {
    const score = scoreOf(input, assignment, planner)
    if (best === null || compareScores(score, best) > 0) best = score
    let i = 0
    while (i < n && assignment[i] === k - 1) assignment[i++] = 0
    if (i === n) return best
    assignment[i]++
  }
}
