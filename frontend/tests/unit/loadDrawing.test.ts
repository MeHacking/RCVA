import { describe, expect, it } from 'vitest'
import type { LoadPlan, Placement } from '../../src/api/types'
import { blockColor, blockNumbers, drawOrder, obliqueDrawing } from '../../src/features/optimization/loadDrawing'
import { planShipments } from '../../src/features/truck-3d/planShipments'
import { placementColor } from '../../src/features/truck-3d/placementColor'

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
    expect(drawing.blocks.map((b) => b.shipmentId)).toEqual([10, 20, 30])
    expect(drawing.labels.map((l) => [l.shipmentId, l.number])).toEqual([
      [10, 3],
      [20, 2],
      [30, 1],
    ])
    // The number is in the middle of the block's front face.
    expect(drawing.labels[1].at).toEqual([6000 + 1200, -750])
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

// S5 from smartLoad+ between S10 and S30: two pallets side by side, a crate on the far one.
const piece = (n: number, x: number, y: number, z: number, l: number, w: number, h: number): Placement => ({
  shipmentId: 5,
  xMm: x,
  yMm: y,
  zMm: z,
  lengthMm: l,
  widthMm: w,
  heightMm: h,
  rotated: false,
  piece: n,
})
const PIECES: LoadPlan = {
  ...PLAN,
  placements: [
    block(10, 0, 6000),
    piece(1, 6000, 0, 0, 1200, 800, 1100),
    piece(2, 6000, 800, 0, 1200, 800, 1100),
    piece(3, 6100, 900, 1100, 600, 600, 500),
    block(30, 7200, 5000),
  ],
}

describe('a shipment of many pieces (smartLoad+)', () => {
  it('is one shipment with the room its pieces take', () => {
    expect(planShipments(PIECES.placements).map(({ shipmentId, pieces, xMm, yMm, zMm, lengthMm, widthMm, heightMm }) => [
      shipmentId,
      pieces,
      [xMm, yMm, zMm],
      [lengthMm, widthMm, heightMm],
    ])).toEqual([
      [10, 1, [0, 0, 0], [6000, 2480, 2700]],
      [5, 3, [6000, 0, 0], [1200, 1600, 1600]],
      [30, 1, [7200, 0, 0], [5000, 2480, 2700]],
    ])
  })

  it('takes the room of all its pieces, along the truck too', () => {
    const [along] = planShipments([piece(1, 1000, 0, 0, 1200, 800, 1100), piece(2, 2200, 400, 0, 1200, 800, 900)])
    expect(along).toMatchObject({ pieces: 2, xMm: 1000, yMm: 0, lengthMm: 2400, widthMm: 1200, heightMm: 1100 })
  })

  it('has one number and one colour, by its place among the shipments', () => {
    expect([...blockNumbers(PIECES)]).toEqual([
      [30, 1],
      [5, 2],
      [10, 3],
    ])
    expect(blockColor(PIECES, 5)).toBe(placementColor(1))
    expect(blockColor(PIECES, 30)).toBe(placementColor(2))
    const drawing = obliqueDrawing(PIECES, SPACE)
    expect(drawing.blocks.filter((b) => b.shipmentId === 5).map((b) => b.color)).toEqual(Array(3).fill(placementColor(1)))
    expect(drawing.labels.map((l) => [l.shipmentId, l.number])).toEqual([
      [10, 3],
      [5, 2],
      [30, 1],
    ])
  })

  it('draws far pieces first: across before near, below before on top, the front wall side before the doors', () => {
    const order = drawOrder(PIECES.placements).map((p) => (p.piece ? `5.${p.piece}` : String(p.shipmentId)))
    const before = (a: string, b: string) => order.indexOf(a) < order.indexOf(b)
    // The far pallet before the near one, and before the crate on it.
    expect(before('5.2', '5.1')).toBe(true)
    expect(before('5.2', '5.3')).toBe(true)
    // S10 is behind the pallets (nearer the front wall), S30 in front of them all.
    expect(['5.1', '5.2', '5.3'].every((p) => before('10', p) && before(p, '30'))).toBe(true)
  })

  it('draws a crate after the pallet it stands on, though the plain order (far across first) would not', () => {
    // A deep pallet from the near side, and a crate on its far half: the crate is further across, but on top.
    const placements = [piece(1, 0, 0, 0, 1200, 1600, 1100), piece(2, 0, 800, 1100, 1200, 800, 500)]
    expect(drawOrder(placements).map((p) => p.piece)).toEqual([1, 2])
  })
})
