import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import { buildLoadPlan } from '../../src/api/mock/loadPlan'
import { SCENARIOS } from '../../src/fixtures'
import { truck } from '../../src/fixtures/scenario'

describe('mock load plan', () => {
  const scenario = SCENARIOS.small
  if (scenario.outcome.kind !== 'COMPLETED') throw new Error('small must be COMPLETED')
  const { result } = scenario.outcome

  it('is illustrative when a shipment has no dimensions: full-width blocks, length from LDM', () => {
    const plan = buildLoadPlan(1, result, scenario.trucks[0], scenario.shipments)
    expect(plan.mode).toBe('ILLUSTRATIVE_LDM')
    expect(plan.placements.map((p) => [p.shipmentId, p.xMm, p.lengthMm, p.widthMm, p.heightMm])).toEqual([
      [105, 0, 2400, 2480, 2700],
      [103, 2400, 6000, 2480, 2200], // S-103 has a height of 2200 mm
      [104, 8400, 5000, 2480, 2700],
    ])
    expect(plan.warnings).toEqual([])
  })

  it('is dimensional when every shipment on the truck has dimensions', () => {
    const shipments = scenario.shipments.map((s) => ({ ...s, lengthMm: 1200, widthMm: 800, heightMm: 1000 }))
    const plan = buildLoadPlan(1, result, scenario.trucks[1], shipments)
    expect(plan.mode).toBe('DIMENSIONAL')
    expect(plan.placements.map((p) => [p.xMm, p.lengthMm, p.widthMm])).toEqual([
      [0, 1200, 800],
      [1200, 1200, 800],
    ])
  })

  it('warns when the row is longer than the cargo space', () => {
    const short = { ...scenario.trucks[0], innerLengthMm: 10000 }
    expect(buildLoadPlan(1, result, short, scenario.shipments).warnings).toEqual([
      'Raspored je duži od tovarnog prostora (13400 mm > 10000 mm).',
    ])
  })

  it('rejects a truck without cargo dimensions (409) or without a route (404)', () => {
    const statusOf = (build: () => unknown) => {
      try {
        build()
        return 'no error'
      } catch (e) {
        return e instanceof ApiError ? e.status : 'not an ApiError'
      }
    }
    const noDims = truck(1, 'Bez dimenzija', 136, null)
    expect(statusOf(() => buildLoadPlan(1, result, noDims, scenario.shipments))).toBe(409)
    expect(statusOf(() => buildLoadPlan(1, result, scenario.trucks[2], scenario.shipments))).toBe(404)
  })
})
