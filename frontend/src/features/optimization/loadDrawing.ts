import type { LoadPlan, Placement } from '../../api/types'
import { planShipments, shipmentColors } from '../truck-3d/planShipments'

// The load of a truck drawn for the PDF from its load plan (no WebGL, so it prints sharp and
// the same everywhere): an oblique 3D view, seen from the side with the doors on the right,
// with a number on each shipment. Units are mm (the SVG viewBox), so the drawing keeps the real
// proportions. A shipment with a layout from smartLoad+ is drawn piece by piece, in its colour,
// with one number.

export interface CargoSpace {
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
}

/** A shipment's number in the drawings: 1 stands at the doors and is unloaded first. */
export function blockNumbers(plan: LoadPlan): Map<number, number> {
  const fromDoors = planShipments(plan.placements).sort((a, b) => b.xMm + b.lengthMm - (a.xMm + a.lengthMm) || a.yMm - b.yMm)
  return new Map(fromDoors.map((s, i) => [s.shipmentId, i + 1]))
}

/** The shipment's colour: as in the list beside the 3D view (its place in the plan). */
export function blockColor(plan: LoadPlan, shipmentId: number): string {
  return shipmentColors(plan.placements).get(shipmentId) ?? 'transparent'
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
  color: string
  /** the visible faces, as SVG polygon points: the side toward the viewer, the top, the end toward the doors */
  front: string
  top: string
  end: string
}

export interface ObliqueLabel {
  shipmentId: number
  number: number
  /** the middle of the front of the room the shipment takes */
  at: Point
}

export interface ObliqueDrawing {
  viewBox: string
  /** the far faces of the cargo space, drawn under the blocks: floor, back wall, front wall */
  floor: string
  backWall: string
  frontWall: string
  /** the near edges of the cargo space, drawn over the blocks */
  edges: string
  /** far blocks first, so a near one covers them */
  blocks: ObliqueBlock[]
  /** one number per shipment, drawn over all blocks */
  labels: ObliqueLabel[]
  fontSize: number
  /** where "prednji zid" and "vrata" are written */
  frontLabelAt: Point
  doorsLabelAt: Point
}

export function obliqueDrawing(plan: LoadPlan, space: CargoSpace): ObliqueDrawing {
  const { innerLengthMm: L, innerWidthMm: W, innerHeightMm: H } = room(plan, space)
  const numbers = blockNumbers(plan)
  const colors = shipmentColors(plan.placements)
  const fontSize = Math.max(L, 4000) / 40
  const blocks = drawOrder(plan.placements).map((p): ObliqueBlock => {
    const [x0, x1, y0, y1, z0, z1] = [p.xMm, p.xMm + p.lengthMm, p.yMm, p.yMm + p.widthMm, p.zMm, p.zMm + p.heightMm]
    return {
      shipmentId: p.shipmentId,
      color: colors.get(p.shipmentId) as string,
      front: points([project(x0, y0, z0), project(x1, y0, z0), project(x1, y0, z1), project(x0, y0, z1)]),
      top: points([project(x0, y0, z1), project(x1, y0, z1), project(x1, y1, z1), project(x0, y1, z1)]),
      end: points([project(x1, y0, z0), project(x1, y1, z0), project(x1, y1, z1), project(x1, y0, z1)]),
    }
  })
  const labels = planShipments(plan.placements).map((s) => ({
    shipmentId: s.shipmentId,
    number: numbers.get(s.shipmentId) ?? 0,
    at: project(s.xMm + s.lengthMm / 2, s.yMm, s.zMm + s.heightMm / 2),
  }))
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
    labels,
    fontSize,
    frontLabelAt: project(0, 0, -fontSize * 1.2),
    doorsLabelAt: project(L, 0, -fontSize * 1.2),
  }
}

/**
 * The blocks far ones first (painter's order). The viewer looks from the near side (y = 0),
 * from above and from the doors' end, so of two blocks that cover each other in the drawing,
 * the one further across, lower or nearer the front wall is behind. Boxes that do not
 * intersect have a plane between them that says which; if two planes disagree, nothing of
 * one is in front of the other. Only pairs that overlap in the drawing are ordered; the rest
 * keep the plain order (far across first, then from the front wall, then from the floor).
 */
export function drawOrder(placements: Placement[]): Placement[] {
  const plain = [...placements].sort((a, b) => b.yMm - a.yMm || a.xMm - b.xMm || a.zMm - b.zMm)
  const n = plain.length
  const later: number[][] = plain.map(() => [])
  const waiting = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [a, b] = [plain[i], plain[j]]
      if (!overlapInDrawing(a, b)) continue
      const ab = behind(a, b)
      const ba = behind(b, a)
      if (ab === ba) continue
      const [first, second] = ab ? [i, j] : [j, i]
      later[first].push(second)
      waiting[second]++
    }
  }
  const order: number[] = []
  const done = new Array<boolean>(n).fill(false)
  while (order.length < n) {
    // The first in the plain order that nothing is waiting in front of; on a cycle (boxes
    // that overlap, which a plan should not have), the first left.
    let next = -1
    for (let i = 0; i < n && next < 0; i++) if (!done[i] && waiting[i] === 0) next = i
    if (next < 0) next = done.indexOf(false)
    done[next] = true
    order.push(next)
    for (const k of later[next]) waiting[k]--
  }
  return order.map((i) => plain[i])
}

function behind(a: Placement, b: Placement): boolean {
  return a.yMm >= b.yMm + b.widthMm || a.zMm + a.heightMm <= b.zMm || a.xMm + a.lengthMm <= b.xMm
}

/** Whether the drawn outlines of two blocks can cover each other (their bounding boxes in the drawing). */
function overlapInDrawing(a: Placement, b: Placement): boolean {
  const span = (p: Placement) => ({
    left: p.xMm + p.yMm * DEPTH_X,
    right: p.xMm + p.lengthMm + (p.yMm + p.widthMm) * DEPTH_X,
    low: p.zMm + p.yMm * DEPTH_UP,
    high: p.zMm + p.heightMm + (p.yMm + p.widthMm) * DEPTH_UP,
  })
  const [s, t] = [span(a), span(b)]
  return s.left < t.right && t.left < s.right && s.low < t.high && t.low < s.high
}
