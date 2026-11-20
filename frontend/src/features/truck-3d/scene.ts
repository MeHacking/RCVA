import type { Placement } from '../../api/types'
import type { Yard } from '../../domain/loadEditing'
import { shipmentColors } from './planShipments'
import { truckShape } from './truckShape'

// The load plan -> the 3D scene, without three.js (so it can be tested). Taken over from
// smartLoad (editor/scene.ts) and fitted to our plan.
// Plan (API): millimetres; x along the cargo space from the front wall (the doors are at
// x = length), y across, z up.
// Scene: centimetres; X along, Y up, Z across; the floor's front corner at the origin, the
// cab at negative X and the ground at -deck.

export interface CargoSpaceMm {
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
}

/** The cargo space in cm. */
export interface Space {
  L: number
  W: number
  H: number
  /** the editor: the ground around the truck is drawn, and is in the picture (yardOf) */
  yard?: boolean
}

/** One block in cm, as placed (l along, w across, h up): a shipment, or a piece of one from smartLoad+. */
export interface Piece {
  shipmentId: number
  color: string
  x: number
  y: number
  z: number
  l: number
  w: number
  h: number
  /** on the ground beside the truck (the editor) */
  out?: boolean
}

export interface Box {
  cx: number
  cy: number
  cz: number
  sx: number
  sy: number
  sz: number
}

export type ViewName = 'iso' | 'top' | 'side' | 'back'

const cm = (mm: number) => mm / 10

export function spaceOf(truck: CargoSpaceMm): Space {
  return { L: cm(truck.innerLengthMm), W: cm(truck.innerWidthMm), H: cm(truck.innerHeightMm) }
}

/**
 * The colour is the shipment's place in the plan, as in the list beside the view and in the
 * PDF; every piece of a shipment from smartLoad+ has it.
 */
export function piecesFromPlan(placements: Placement[]): Piece[] {
  const colors = shipmentColors(placements)
  return placements.map((p) => ({
    shipmentId: p.shipmentId,
    color: colors.get(p.shipmentId) as string,
    x: cm(p.xMm),
    y: cm(p.yMm),
    z: cm(p.zMm),
    l: cm(p.lengthMm),
    w: cm(p.widthMm),
    h: cm(p.heightMm),
  }))
}

export function boxFor(p: Pick<Piece, 'x' | 'y' | 'z' | 'l' | 'w' | 'h'>): Box {
  return { cx: p.x + p.l / 2, cy: p.z + p.h / 2, cz: p.y + p.w / 2, sx: p.l, sy: p.h, sz: p.w }
}

/** The occupied length of the cargo space (cm): where the furthest block in the truck ends. */
export function usedLength(pieces: Piece[]): number {
  return pieces.reduce((end, p) => (p.out ? end : Math.max(end, p.x + p.l)), 0)
}

/**
 * The ground around the truck where the editor puts shipments aside (as smartLoad's yardOf): 1.5 m
 * in front of the cab, 4.5 m behind the doors and 3.2 m to each side, in plan cm.
 */
export function yardOf(s: Pick<Space, 'L' | 'W'>): Yard {
  const t = truckShape(s.L)
  return {
    minX: -t.x0 - 150,
    maxX: s.L + 450,
    minY: -320,
    maxY: s.W + 320,
    truck: { minX: -t.x0, maxX: s.L + 15, minY: -t.wheelOut, maxY: s.W + t.wheelOut },
    groundZ: -t.deck,
  }
}

/** The whole truck in scene units: cab front to rear bumper, ground to the highest top. */
export function truckExtent(s: Space) {
  const t = truckShape(s.L)
  if (s.yard) {
    // The editor: the ground around the truck is in the picture too (shipments put aside there).
    const y = yardOf(s)
    return { minX: y.minX, maxX: y.maxX, minY: -t.deck, maxY: Math.max(s.H, t.cabH - t.deck), minZ: y.minY, maxZ: y.maxY }
  }
  return {
    minX: -t.x0,
    maxX: s.L + 15,
    minY: -t.deck,
    maxY: Math.max(s.H, t.cabH - t.deck),
    minZ: -t.wheelOut,
    maxZ: s.W + t.wheelOut,
  }
}

/** The eight corners of truckExtent. */
export function extentCorners(s: Space): [number, number, number][] {
  const e = truckExtent(s)
  const corners: [number, number, number][] = []
  for (const x of [e.minX, e.maxX]) for (const y of [e.minY, e.maxY]) for (const z of [e.minZ, e.maxZ]) corners.push([x, y, z])
  return corners
}

type Vec = [number, number, number]
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const times = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec): Vec => times(a, 1 / Math.hypot(...a))

/** The camera's right, up and forward axes when it looks from `pos` at `target` (as three.js lookAt). */
export function cameraAxes(pos: Vec, target: Vec): { right: Vec; up: Vec; forward: Vec } {
  const forward = unit(sub(target, pos))
  const right = unit(cross(forward, [0, 1, 0]))
  return { right, up: cross(right, forward), forward }
}

/**
 * The camera for a view with the whole truck in the picture: it looks the way cameraFor says,
 * and stands where every corner of the truck lies within `fill` of the picture, centred, as
 * close as that allows (so one direction is filled to `fill`).
 *
 * With the looking direction fixed, "the corner is inside" is linear in the camera position:
 * a corner at (x, y, z) in camera axes is inside when |x| <= kx z and |y| <= ky z, and moving
 * the camera by a right, b up and e forward subtracts them from x, y and z. So the position is
 * solved directly. (smartLoad moved the camera step by step; looking along the truck, from the
 * doors, near and far corners pulled against each other and the steps never settled.)
 */
export function fitView(view: ViewName, s: Space, aspect: number, fovDeg = 40, fill = 0.88): { pos: Vec; target: Vec } {
  const { pos, target } = cameraFor(view, s, aspect, fovDeg)
  const { right, up, forward } = cameraAxes(pos, target)
  const ky = Math.tan((fovDeg * Math.PI) / 360) * fill
  const kx = ky * aspect
  // For each axis, a - k e >= low and a + k e <= high must hold for every corner.
  let lowX = -Infinity
  let highX = Infinity
  let lowY = -Infinity
  let highY = Infinity
  for (const corner of extentCorners(s)) {
    const d = sub(corner, pos)
    const x = dot(d, right)
    const y = dot(d, up)
    const z = dot(d, forward)
    lowX = Math.max(lowX, x - kx * z)
    highX = Math.min(highX, x + kx * z)
    lowY = Math.max(lowY, y - ky * z)
    highY = Math.min(highY, y + ky * z)
  }
  const e = Math.min((highX - lowX) / (2 * kx), (highY - lowY) / (2 * ky))
  const at = add(pos, add(times(right, (lowX + highX) / 2), add(times(up, (lowY + highY) / 2), times(forward, e))))
  // The point the view turns around stays straight ahead, as far as it was (at least 1 m).
  const dist = Math.hypot(...sub(target, pos))
  return { pos: at, target: add(at, times(forward, Math.max(dist - e, 100))) }
}

/** Where a point is in the picture (-1..1 inside), seen from `pos` towards `target`. */
export function projectPoint(point: Vec, pos: Vec, target: Vec, aspect: number, fovDeg = 40): { x: number; y: number } {
  const { right, up, forward } = cameraAxes(pos, target)
  const d = sub(point, pos)
  const k = Math.tan((fovDeg * Math.PI) / 360)
  const z = dot(d, forward)
  return { x: dot(d, right) / (z * k * aspect), y: dot(d, up) / (z * k) }
}

/**
 * Where the camera stands and looks for each view: obliquely from above, behind and on the
 * left (Ukoso), straight down (Odozgo), at the long side (Sa strane) and in at the doors (Od
 * vrata). fitView then places it so the whole truck is in the picture.
 */
export function cameraFor(
  view: ViewName,
  s: Space,
  aspect: number,
  fovDeg = 40,
): { pos: [number, number, number]; target: [number, number, number] } {
  const e = truckExtent(s)
  const len = e.maxX - e.minX
  const tall = e.maxY - e.minY
  const wide = e.maxZ - e.minZ
  const cx = (e.minX + e.maxX) / 2
  const cy = (e.minY + e.maxY) / 2
  const cz = s.W / 2
  const half = (fovDeg * Math.PI) / 360
  // The distance at which a horizontal and a vertical span both fit the view.
  const fit = (across: number, up: number) => (Math.max(across / Math.max(aspect, 0.3), up) / 2 / Math.tan(half)) * 1.12
  switch (view) {
    case 'top':
      return { pos: [cx, e.maxY + fit(len, wide), cz + 0.01], target: [cx, 0, cz] }
    case 'side':
      return { pos: [cx, cy, e.maxZ + fit(len, tall)], target: [cx, cy, cz] }
    case 'back':
      return { pos: [e.maxX + fit(wide, tall) + 80, cy + tall * 0.25, cz], target: [s.L / 2, cy, cz] }
    case 'iso': {
      // Short trucks are tall for their length, so their height decides as well.
      const d = Math.max(fit(len * 1.15, tall), fit(len * 0.6, tall * 2.2)) * 1.2
      const dir = [0.55, 0.5, 0.7]
      const n = Math.hypot(dir[0], dir[1], dir[2])
      return { pos: [cx + (d * dir[0]) / n, cy + (d * dir[1]) / n, cz + (d * dir[2]) / n], target: [cx, cy, cz] }
    }
  }
}
