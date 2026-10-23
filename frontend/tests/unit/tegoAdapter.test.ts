import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import { buildLoadPlan } from '../../src/api/mock/loadPlan'
import { toViewerBin, toViewerItems } from '../../src/features/truck-3d/tego/tegoAdapter'
import { SCENARIOS } from '../../src/fixtures'
import { truck } from '../../src/fixtures/scenario'

describe('TeGo adapter (mm -> cm, axes as in mapJsonToViewerFormat)', () => {
  it('maps the cargo space: length -> x (width), height -> y, width -> z (depth)', () => {
    expect(toViewerBin({ innerLengthMm: 13600, innerWidthMm: 2480, innerHeightMm: 2700 })).toEqual({
      x: 0,
      y: 0,
      z: 0,
      width: 1360,
      height: 270,
      depth: 248,
    })
  })

  it('maps placements: y (across) -> z, z (up) -> y', () => {
    const [item] = toViewerItems([
      { shipmentId: 7, xMm: 1000, yMm: 200, zMm: 300, lengthMm: 1200, widthMm: 800, heightMm: 1500, rotated: true },
    ])
    expect(item).toMatchObject({ shipmentId: 7, x: 100, y: 30, z: 20, width: 120, height: 150, depth: 80 })
    expect(item.color).toMatch(/^0x[0-9a-f]{6}$/)
  })
})

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
