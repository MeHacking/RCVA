import { describe, expect, it } from 'vitest'
import { compareScores, plannerFor, solve, type Score, type SolverInput } from '../../src/domain/optimization/solver'
import { baseRules } from '../../src/domain/optimization/routePlanner'
import oracle from './timefold.json'

// The TypeScript solver must not be worse than Timefold on the same instances. Timefold's
// results come from backend/src/test/java/rs/rcva/optimization/oracle/TimefoldOracleTest.java
// (see vitest.oracle.config.ts). The TypeScript solver gets as much time per case as
// Timefold had; ORACLE_MS sets another time (with 2000 ms one case was 0,14 % longer).

interface OracleCase {
  name: string
  distance: number[][]
  base: number
  returnToBase: boolean
  shipments: { ldmTenths: number; pickup: number; delivery: number }[]
  trucks: { id: number; capacityLdmTenths: number }[]
  timefoldSeconds: number
  hard: number
  medium: number
  soft: number
  routes: { truckId: number; shipments: number[]; meters: number }[]
}

const cases = (oracle as { cases: OracleCase[] }).cases
const timeLimitMs = Number(import.meta.env.ORACLE_MS ?? cases[0].timefoldSeconds * 1000)

/** The Java model: Spec v2 rules, weight not limited. */
function inputOf(c: OracleCase): SolverInput {
  return {
    distance: c.distance,
    rules: baseRules(c.base, c.returnToBase),
    shipments: c.shipments.map((s) => ({ ...s, weightKg: 0 })),
    trucks: c.trucks.map((t) => ({ ...t, capacityKg: Infinity })),
  }
}

function km(meters: number): string {
  return (meters / 1000).toFixed(1)
}

describe('Timefold oracle', () => {
  it('has the cases', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  it('gives the same route lengths as the Java RoutePlanner for Timefold routes', () => {
    for (const c of cases) {
      const planner = plannerFor(inputOf(c))
      for (const route of c.routes) {
        expect(planner.meters(route.shipments), `${c.name}, truck ${route.truckId}`).toBe(route.meters)
      }
    }
  })

  it('is not worse than Timefold on any case', () => {
    const rows: string[] = []
    const worse: string[] = []
    for (const c of cases) {
      const timefold: Score = { hard: c.hard, medium: c.medium, soft: c.soft }
      const result = solve(inputOf(c), { seed: 1, timeLimitMs })
      const verdict = compareScores(result.score, timefold)
      const label = verdict > 0 ? 'bolji' : verdict === 0 ? 'isti' : 'LOŠIJI'
      rows.push(
        `${c.name.padEnd(12)} ${String(c.shipments.length).padStart(3)} pošiljki | ` +
          `Timefold ${-c.medium} kam. ${km(-c.soft).padStart(9)} km | ` +
          `TS ${-result.score.medium} kam. ${km(-result.score.soft).padStart(9)} km | ${label}`,
      )
      if (verdict < 0) worse.push(c.name)
    }
    console.log(`TS ${timeLimitMs} ms po slučaju, Timefold ${cases[0].timefoldSeconds} s\n${rows.join('\n')}`)
    expect(worse).toEqual([])
  })
})
