import { describe, expect, it } from 'vitest'
import type { LoadPlan, Placement } from '../../src/api/types'
import { blockColor, blockNumbers, obliqueDrawing } from '../../src/features/optimization/loadDrawing'
import { placementColor } from '../../src/features/truck-3d/tego/tegoAdapter'

const SPACE = { innerLengthMm: 13_600, innerWidthMm: 2480, innerHeightMm: 2700 }
const block = (shipmentId: number, xMm: number, lengthMm: number, more: Partial<Placement> = {}): Placement => ({
  shipmentId,
  xMm,
  yMm: 0,
  zMm: 0,
  lengthMm,
  widthMm: 2480,
  heightMm: 2700,
  rotated: false,
  ...more,
})
// Rear loading: from the front wall, the last unloaded first; 30 stands at the doors.
const PLAN: LoadPlan = {
  jobId: 1,
  truckId: 1,
  mode: 'ILLUSTRATIVE_LDM',
  placements: [block(10, 0, 6000), block(20, 6000, 2400, { heightMm: 1500 }), block(30, 8400, 5000)],
  warnings: [],
}

describe('blockNumbers', () => {
  it('numbers the blocks from the doors: 1 is unloaded first', () => {
    expect([...blockNumbers(PLAN)]).toEqual([
      [30, 1],
      [20, 2],
      [10, 3],
    ])
  })

  it('gives blocks side by side at the same end the near one first', () => {
    const plan = { ...PLAN, placements: [block(1, 0, 1200, { yMm: 1240, widthMm: 1240 }), block(2, 0, 1200, { widthMm: 1240 })] }
    expect([...blockNumbers(plan)]).toEqual([
      [2, 1],
      [1, 2],
    ])
  })
})

describe('blockColor', () => {
  it('is the colour of the block in the list beside the 3D view', () => {
    expect(blockColor(PLAN, 20)).toBe(placementColor(1))
  })
})

describe('obliqueDrawing', () => {
  const drawing = obliqueDrawing(PLAN, SPACE)

  it('draws from the front wall to the doors, so each block covers the end of the one before', () => {
    expect(drawing.blocks.map((b) => [b.shipmentId, b.number])).toEqual([
      [10, 3],
      [20, 2],
      [30, 1],
    ])
  })

  it('draws the front face at the true size, and the depth up and to the right', () => {
    const first = drawing.blocks[0]
    expect(first.front).toBe('0,0 6000,0 6000,-2700 0,-2700')
    // The far corner of the top: 2480 mm deep, at half scale and 30° up.
    const [x, y] = first.top.split(' ')[2].split(',').map(Number)
    expect(x).toBeCloseTo(6000 + 2480 * 0.5 * Math.cos(Math.PI / 6), 0)
    expect(y).toBeCloseTo(-(2700 + 2480 * 0.25), 0)
  })

  it('makes room for blocks beyond the cargo space instead of cutting them', () => {
    const long = { ...PLAN, placements: [...PLAN.placements, block(40, 13_400, 1000)] }
    const [, , width] = obliqueDrawing(long, SPACE).viewBox.split(' ').map(Number)
    const [, , normal] = drawing.viewBox.split(' ').map(Number)
    expect(width - normal).toBeGreaterThanOrEqual(800) // 14 400 mm instead of 13 600 (the margins grow with it)
  })
})
