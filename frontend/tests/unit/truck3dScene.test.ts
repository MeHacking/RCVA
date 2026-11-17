import { describe, expect, it } from 'vitest'
import type { Placement } from '../../src/api/types'
import { placementColor } from '../../src/features/truck-3d/placementColor'
import {
  boxFor,
  cameraFor,
  extentCorners,
  fitView,
  piecesFromPlan,
  projectPoint,
  spaceOf,
  truckExtent,
  usedLength,
  type ViewName,
} from '../../src/features/truck-3d/scene'
import { truckShape } from '../../src/features/truck-3d/truckShape'

const TRAILER = spaceOf({ innerLengthMm: 13_600, innerWidthMm: 2480, innerHeightMm: 2700 })
const VAN = spaceOf({ innerLengthMm: 4200, innerWidthMm: 2000, innerHeightMm: 2100 })

const placement = (shipmentId: number, xMm: number, lengthMm: number): Placement => ({
  shipmentId,
  xMm,
  yMm: 200,
  zMm: 300,
  lengthMm,
  widthMm: 800,
  heightMm: 1500,
  rotated: false,
})

describe('3D scene from the load plan', () => {
  it('turns millimetres into centimetres', () => {
    expect(TRAILER).toEqual({ L: 1360, W: 248, H: 270 })
  })

  it('keeps the plan order, and colours each block by its place, as the list and the PDF do', () => {
    const pieces = piecesFromPlan([placement(7, 1000, 1200), placement(3, 2200, 600)])
    expect(pieces).toEqual([
      { shipmentId: 7, color: placementColor(0), x: 100, y: 20, z: 30, l: 120, w: 80, h: 150 },
      { shipmentId: 3, color: placementColor(1), x: 220, y: 20, z: 30, l: 60, w: 80, h: 150 },
    ])
    expect(placementColor(0)).not.toBe(placementColor(1))
  })

  it('puts a block with plan y (across) on scene Z and plan z (up) on scene Y', () => {
    const [piece] = piecesFromPlan([placement(7, 1000, 1200)])
    expect(boxFor(piece)).toEqual({ cx: 160, cy: 105, cz: 60, sx: 120, sy: 150, sz: 80 })
  })

  it('measures the occupied length to the end of the furthest block', () => {
    expect(usedLength([])).toBe(0)
    expect(usedLength(piecesFromPlan([placement(1, 2200, 600), placement(2, 0, 1200)]))).toBe(280)
  })
})

describe('the truck around the cargo space', () => {
  it('is a tractor with a semi-trailer from 10 m, a rigid truck below', () => {
    expect(truckShape(1360).semi).toBe(true)
    expect(truckShape(1000).semi).toBe(true)
    expect(truckShape(999).semi).toBe(false)
    expect(truckShape(1360).axles).toHaveLength(6)
    expect(truckShape(420).axles).toHaveLength(2)
  })

  it('spans from the front of the cab to past the doors, and from the ground up', () => {
    const t = truckShape(TRAILER.L)
    const e = truckExtent(TRAILER)
    expect(e.minX).toBe(-t.x0)
    expect(e.maxX).toBeGreaterThan(TRAILER.L)
    expect(e.minY).toBe(-t.deck)
    expect(e.maxY).toBe(Math.max(TRAILER.H, t.cabH - t.deck))
    expect(e.minZ).toBeLessThan(0)
    expect(e.maxZ).toBeGreaterThan(TRAILER.W)
    // every axle lies under the truck
    for (const axle of t.axles) expect(axle - t.x0).toBeGreaterThan(e.minX)
    expect(extentCorners(TRAILER)).toHaveLength(8)
  })
})

describe('camera for each view', () => {
  const views: ViewName[] = ['iso', 'top', 'side', 'back']
  const centre = (s: typeof TRAILER) => {
    const e = truckExtent(s)
    return [(e.minX + e.maxX) / 2, (e.minY + e.maxY) / 2, (e.minZ + e.maxZ) / 2]
  }

  it.each(views)('%s stands outside the truck', (view) => {
    for (const space of [TRAILER, VAN]) {
      const e = truckExtent(space)
      const [x, y, z] = cameraFor(view, space, 16 / 9).pos
      const inside = x > e.minX && x < e.maxX && y > e.minY && y < e.maxY && z > e.minZ && z < e.maxZ
      expect(inside).toBe(false)
    }
  })

  it('looks from where the view says', () => {
    const [cx, , cz] = centre(TRAILER)
    const e = truckExtent(TRAILER)
    const top = cameraFor('top', TRAILER, 2)
    expect(top.pos[1]).toBeGreaterThan(e.maxY)
    expect(Math.abs(top.pos[0] - cx)).toBeLessThan(1)
    const side = cameraFor('side', TRAILER, 2)
    expect(side.pos[2]).toBeGreaterThan(e.maxZ) // the truck's left side
    const back = cameraFor('back', TRAILER, 2)
    expect(back.pos[0]).toBeGreaterThan(e.maxX) // behind the doors
    const iso = cameraFor('iso', TRAILER, 2)
    expect(iso.pos[0]).toBeGreaterThan(cx) // from behind
    expect(iso.pos[1]).toBeGreaterThan(e.maxY) // from above
    expect(iso.pos[2]).toBeGreaterThan(cz) // on the left
  })

  it('stands further back on a narrower picture', () => {
    const dist = (aspect: number) => {
      const { pos, target } = cameraFor('side', TRAILER, aspect)
      return Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2])
    }
    expect(dist(1)).toBeGreaterThan(dist(2))
  })
})

describe('fitView: the whole truck in the picture', () => {
  const views: ViewName[] = ['iso', 'top', 'side', 'back']
  const spaces = [
    { name: 'trailer', space: TRAILER },
    { name: 'van', space: VAN },
  ]
  const cases = views.flatMap((view) =>
    [16 / 9, 1, 0.6].flatMap((aspect) => spaces.map(({ name, space }) => ({ view, aspect, name, space }))),
  )

  it.each(cases)('$view, $name, aspect $aspect: every corner inside, one direction filled to 88 %', ({ view, space, aspect }) => {
    const { pos, target } = fitView(view, space, aspect)
    const points = extentCorners(space).map((c) => projectPoint(c, pos, target, aspect))
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    for (const v of [...xs, ...ys]) expect(Math.abs(v)).toBeLessThanOrEqual(0.88 + 1e-6)
    const filled = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    expect(filled).toBeCloseTo(1.76, 3)
  })

  it('keeps the looking direction of the view, and the turning point straight ahead', () => {
    for (const view of views) {
      const raw = cameraFor(view, TRAILER, 2)
      const fit = fitView(view, TRAILER, 2)
      const dir = (a: number[], b: number[]) => {
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const n = Math.hypot(d[0], d[1], d[2])
        return d.map((v) => v / n)
      }
      const before = dir(raw.pos, raw.target)
      const after = dir(fit.pos, fit.target)
      for (let i = 0; i < 3; i++) expect(after[i]).toBeCloseTo(before[i], 6)
    }
  })
})
