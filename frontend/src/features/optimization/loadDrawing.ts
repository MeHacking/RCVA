import type { LoadPlan, Placement } from '../../api/types'
import { placementColor } from '../truck-3d/tego/tegoAdapter'

// The load of a truck drawn for the PDF from its load plan (no WebGL, so it prints sharp and
// the same everywhere): an oblique 3D view, seen from the side with the doors on the right,
// with a number on each block. Units are mm (the SVG viewBox), so the drawing keeps the real
// proportions.

export interface CargoSpace {
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
}

/** A block's number in the drawings: 1 stands at the doors and is unloaded first. */
export function blockNumbers(plan: LoadPlan): Map<number, number> {
  const fromDoors = [...plan.placements].sort((a, b) => b.xMm + b.lengthMm - (a.xMm + a.lengthMm) || a.yMm - b.yMm)
  return new Map(fromDoors.map((p, i) => [p.shipmentId, i + 1]))
}

/** The block's colour: as in the list beside the 3D view (its index in the plan). */
export function blockColor(plan: LoadPlan, shipmentId: number): string {
  return placementColor(plan.placements.findIndex((p) => p.shipmentId === shipmentId))
}

/** The cargo space, or the room the blocks take where they reach beyond it (a warning of the plan). */
function room(plan: LoadPlan, space: CargoSpace): CargoSpace {
  const reach = (end: (p: Placement) => number) => Math.max(0, ...plan.placements.map(end))
  return {
    innerLengthMm: Math.max(space.innerLengthMm, reach((p) => p.xMm + p.lengthMm)),
    innerWidthMm: Math.max(space.innerWidthMm, reach((p) => p.yMm + p.widthMm)),
    innerHeightMm: Math.max(space.innerHeightMm, reach((p) => p.zMm + p.heightMm)),
  }
}

// Oblique projection: depth (across the truck) runs up and to the right at half scale.
const DEPTH_X = 0.5 * Math.cos(Math.PI / 6)
const DEPTH_UP = 0.5 * Math.sin(Math.PI / 6)

type Point = [number, number]
const project = (x: number, y: number, z: number): Point => [x + y * DEPTH_X, -(z + y * DEPTH_UP)]
const points = (corners: Point[]) => corners.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
const round = (n: number) => Math.round(n * 10) / 10

export interface ObliqueBlock {
  shipmentId: number
  number: number
  color: string
  /** the visible faces, as SVG polygon points: the side toward the viewer, the top, the end toward the doors */
  front: string
  top: string
  end: string
  /** where the number goes: the middle of the front face */
  labelAt: Point
}

export interface ObliqueDrawing {
  viewBox: string
  /** the far faces of the cargo space, drawn under the blocks: floor, back wall, front wall */
  floor: string
  backWall: string
  frontWall: string
  /** the near edges of the cargo space, drawn over the blocks */
  edges: string
  blocks: ObliqueBlock[]
  fontSize: number
  /** where "prednji zid" and "vrata" are written */
  frontLabelAt: Point
  doorsLabelAt: Point
}

export function obliqueDrawing(plan: LoadPlan, space: CargoSpace): ObliqueDrawing {
  const { innerLengthMm: L, innerWidthMm: W, innerHeightMm: H } = room(plan, space)
  const numbers = blockNumbers(plan)
  const fontSize = Math.max(L, 4000) / 40
  // Far first, and along the truck from the front wall: a block covers the end of the one before.
  const order = [...plan.placements].sort((a, b) => b.yMm - a.yMm || a.xMm - b.xMm || a.zMm - b.zMm)
  const blocks = order.map((p): ObliqueBlock => {
    const [x0, x1, y0, y1, z0, z1] = [p.xMm, p.xMm + p.lengthMm, p.yMm, p.yMm + p.widthMm, p.zMm, p.zMm + p.heightMm]
    return {
      shipmentId: p.shipmentId,
      number: numbers.get(p.shipmentId) ?? 0,
      color: blockColor(plan, p.shipmentId),
      front: points([project(x0, y0, z0), project(x1, y0, z0), project(x1, y0, z1), project(x0, y0, z1)]),
      top: points([project(x0, y0, z1), project(x1, y0, z1), project(x1, y1, z1), project(x0, y1, z1)]),
      end: points([project(x1, y0, z0), project(x1, y1, z0), project(x1, y1, z1), project(x1, y0, z1)]),
      labelAt: project((x0 + x1) / 2, y0, (z0 + z1) / 2),
    }
  })
  const [left, right] = [0, L + W * DEPTH_X]
  const [top, bottom] = [-(H + W * DEPTH_UP), 0]
  const margin = fontSize * 1.6
  return {
    viewBox: [left - margin, top - margin, right - left + 2 * margin, bottom - top + 2 * margin].map(round).join(' '),
    floor: points([project(0, 0, 0), project(L, 0, 0), project(L, W, 0), project(0, W, 0)]),
    backWall: points([project(0, W, 0), project(L, W, 0), project(L, W, H), project(0, W, H)]),
    frontWall: points([project(0, 0, 0), project(0, W, 0), project(0, W, H), project(0, 0, H)]),
    edges: points([project(0, 0, H), project(L, 0, H), project(L, W, H), project(L, W, 0), project(L, 0, 0), project(L, 0, H)]),
    blocks,
    fontSize,
    frontLabelAt: project(0, 0, -fontSize * 1.2),
    doorsLabelAt: project(L, 0, -fontSize * 1.2),
  }
}
