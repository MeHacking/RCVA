import { describe, expect, it } from 'vitest'
import type { OptimizationResult } from '../../src/api/types'
import type { JobInput } from '../../src/domain/optimization/job'
import { toOptimizationResult } from '../../src/domain/optimization/result'
import { OPEN_ROUTE_REAR_LOADING, type Route, type RouteRules } from '../../src/domain/optimization/routePlanner'
import { SeededRandom } from '../../src/domain/optimization/random'
import { isFeasible, solve, type SolverInput } from '../../src/domain/optimization/solver'
import { validate } from '../../src/domain/optimization/validator'
import { planarDistance, smallOpenInput, smallRandomInput, test7Input } from './solverCases'

/** The same instance as a job: shipment ids 101.., "S1".., location ids 1000.. (not the indices). */
function jobFrom(input: SolverInput): JobInput {
  return {
    shipments: input.shipments.map((s, i) => ({
      id: 101 + i,
      externalId: `S${i + 1}`,
      description: null,
      ldmTenths: s.ldmTenths,
      pickupLocationId: 1000 + s.pickup,
      deliveryLocationId: 1000 + s.delivery,
      splittable: false,
      weightKg: s.weightKg,
      lengthMm: null,
      widthMm: null,
      heightMm: null,
    })),
    trucks: input.trucks.map((t) => ({ ...t, name: `Kamion ${t.id}` })),
    locationIds: input.distance.map((_, i) => 1000 + i),
    distance: input.distance,
    rules: input.rules,
  }
}

function solved(input: SolverInput): OptimizationResult {
  const solution = solve(input, { seed: 7, stepLimit: 3000 })
  return toOptimizationResult(jobFrom(input), solution.routes.map((r) => ({ truckId: r.truckId, route: r.route })))
}

/** One truck with the given order (shipment indices); `meters` is recomputed by the builder. */
function oneRoute(input: SolverInput, pickups: number[], deliveries: number[]): OptimizationResult {
  const route: Route = { pickups, deliveries, meters: 0 }
  return toOptimizationResult(jobFrom(input), [{ truckId: input.trucks[0].id, route }])
}

function test7Open(rules: RouteRules = OPEN_ROUTE_REAR_LOADING): SolverInput {
  return test7Input(rules)
}

describe('validator on solver results', () => {
  it('passes test 7 with the process owner rules', () => {
    const result = solved(test7Open())
    expect(result.validation).toEqual({ passed: true, violations: [] })
    expect(result.trucksUsed).toBe(2)
    expect(result.totalMeters).toBe(900_000)
    expect(result.routes[0].stops[0].legMeters).toBe(0)
  })

  it('passes random instances with both rule sets, with the solver lengths', () => {
    const random = new SeededRandom(31)
    let feasible = 0
    for (let i = 0; i < 40; i++) {
      const input = i % 2 === 0 ? smallOpenInput(random, 3 + (i % 5), 3) : smallRandomInput(random, 3 + (i % 5), 3)
      const solution = solve(input, { seed: i, stepLimit: 500 })
      const result = toOptimizationResult(jobFrom(input), solution.routes.map((r) => ({ truckId: r.truckId, route: r.route })))
      // A short search sometimes ends over capacity; the validator must see that too.
      expect(result.validation.passed).toBe(isFeasible(solution.score))
      if (isFeasible(solution.score)) feasible++
      expect(result.totalMeters).toBe(-solution.score.soft)
      expect(result.trucksUsed).toBe(-solution.score.medium)
    }
    expect(feasible).toBeGreaterThan(30)
  })
})

describe('validator rules', () => {
  it('accepts a valid order that is not the shortest one', () => {
    // On a line (km): S1 from 0 to 20, S2 from 5 to 30.
    const input: SolverInput = {
      distance: planarDistance([[0, 0], [5, 0], [20, 0], [30, 0]]),
      rules: OPEN_ROUTE_REAR_LOADING,
      shipments: [
        { ldmTenths: 10, weightKg: 0, pickup: 0, delivery: 2 },
        { ldmTenths: 10, weightKg: 0, pickup: 1, delivery: 3 },
      ],
      trucks: [{ id: 1, capacityLdmTenths: 136, capacityKg: Infinity }],
    }
    const shorter = oneRoute(input, [1, 0], [0, 1])
    const longer = oneRoute(input, [0, 1], [1, 0])
    expect(shorter.validation.passed).toBe(true)
    expect(longer.validation.passed).toBe(true)
    expect([shorter.totalMeters, longer.totalMeters]).toEqual([35_000, 40_000])
  })

  it('rejects unloading first what was loaded first (rear loading)', () => {
    const result = oneRoute(test7Open(), [0, 2], [0, 2])
    expect(result.validation.violations).toEqual([
      'Kamion 1: S1 je utovarena pre S3, a istovara se pre nje; kamion se tovari samo pozadi.',
    ])
    // Without rear loading the same order is fine.
    expect(oneRoute(test7Open({ start: null, end: null, lifo: false }), [0, 2], [0, 2]).validation.passed).toBe(true)
  })

  it('lets shipments loaded or unloaded at the same place go in any order', () => {
    const input: SolverInput = {
      distance: planarDistance([[0, 0], [100, 0], [200, 0]]),
      rules: OPEN_ROUTE_REAR_LOADING,
      shipments: [
        { ldmTenths: 10, weightKg: 0, pickup: 0, delivery: 1 },
        { ldmTenths: 10, weightKg: 0, pickup: 0, delivery: 1 },
        { ldmTenths: 10, weightKg: 0, pickup: 0, delivery: 2 },
      ],
      trucks: [{ id: 1, capacityLdmTenths: 136, capacityKg: Infinity }],
    }
    expect(oneRoute(input, [0, 1, 2], [0, 1, 2]).validation.violations).toEqual([])
    // Loaded at one place, unloaded at two: S3 is unloaded last, so its order is free too.
    const separate: SolverInput = { ...input, shipments: [{ ...input.shipments[0], pickup: 2 }, input.shipments[2]] }
    expect(oneRoute(separate, [0, 1], [0, 1]).validation.violations).toEqual([
      'Kamion 1: S1 je utovarena pre S2, a istovara se pre nje; kamion se tovari samo pozadi.',
    ])
  })

  it('checks weight against the payload', () => {
    const input = test7Open()
    input.shipments.forEach((s, i) => (s.weightKg = i < 2 ? 8000 : 6000))
    input.trucks.forEach((t) => (t.capacityKg = 13_000))
    // 10,0 LDM fits the truck; 14 t does not. S2 and S4 are listed as unassigned.
    expect(oneRoute(input, [0, 2], [2, 0]).validation.violations).toEqual([
      'Kamion 1: teret 14000 kg je veći od nosivosti 13000 kg.',
    ])
    expect(oneRoute(input, [0], [0]).validation.passed).toBe(true)
  })

  it('has no leg before the first stop of an open route, and adds the leg to a fixed end', () => {
    const open = oneRoute(test7Open(), [0], [0])
    expect(open.routes[0].stops.map((s) => s.legMeters)).toEqual([0, 150_000])
    open.routes[0].stops[0].legMeters = 50_000
    expect(validate(jobFrom(test7Open()), open).violations).toContain('Kamion 1, stanica 1: deonica je 0 m, ne 50000 m.')

    const rules: RouteRules = { start: null, end: 0, lifo: true }
    const toEnd = oneRoute(test7Open(rules), [0], [0])
    expect(toEnd.validation.passed).toBe(true)
    expect(toEnd.totalMeters).toBe(150_000 + 100_000)
    toEnd.routes[0].totalMeters = 150_000
    expect(validate(jobFrom(test7Open(rules)), toEnd).violations).toContain('Kamion 1: dužina rute je 250000 m, ne 150000 m.')
  })

  it('rejects a pickup after the first delivery', () => {
    const result = oneRoute(test7Open(), [0, 2], [2, 0])
    const [p1, p2, d1, d2] = result.routes[0].stops
    // S1 picked up and delivered, then S3: each delivery after its own pickup.
    result.routes[0].stops = [p1, d2, p2, d1].map((s, i) => ({ ...s, sequence: i + 1 }))
    expect(validate(jobFrom(test7Open()), result).violations).toContain(
      'Kamion 1, stanica 3: preuzimanje S3 posle prve isporuke (ruta ima dve faze).',
    )
  })

  it('reports a shipment left out and wrong totals', () => {
    const result = solved(test7Open())
    const job = jobFrom(test7Open())
    const dropped = { ...result, routes: result.routes.slice(1) }
    const violations = validate(job, dropped).violations
    const missing = result.routes[0].stops.filter((s) => s.type === 'PICKUP').map((s) => job.shipments.find((x) => x.id === s.shipmentId)!.externalId)
    for (const label of missing) expect(violations).toContain(`Pošiljka ${label} je preuzeta 0 i isporučena 0 put(a); očekuje se po jednom.`)
    expect(violations).toContain('Broj korišćenih kamiona je 1, ne 2.')
    expect(violations.some((v) => v.startsWith('Ukupna dužina je '))).toBe(true)
  })

  it('reports a truck that is not in the job', () => {
    const result = solved(test7Open())
    result.routes[0] = { ...result.routes[0], truckId: 99 }
    expect(validate(jobFrom(test7Open()), result).violations).toContain('Kamion #99 nije među kamionima ovog posla.')
  })
})
