import type { Placement, RoutePlan } from '../api/types'
import { LONGER_THAN_SPACE } from './optimization/loadPlan'

// A truck's load plan arranged by hand (user, 19.11.2026: "Uredi" on the 3D screen, as the
// layout editor of smartLoad, F:\GitHubProjects\smartLoad, frontend/src/editor/plan.ts). The
// moves are taken over from there; here a whole shipment moves (its block, or all its pieces
// from smartLoad+), with whatever rests on it.
// All lengths in cm, as the 3D scene (scene.ts): x along the cargo space from the front wall
// (the doors are at x = L), y across from the right side, z up. The API keeps mm.

export interface EditPiece {
  /** unique in the plan: the shipment and its piece */
  key: string
  shipmentId: number
  /** the piece's number when the shipment has a layout from smartLoad+ */
  piece?: number
  color: string
  x: number
  y: number
  z: number
  /** as placed: along (l) and across (w); h is the height */
  l: number
  w: number
  h: number
  rotated: boolean
  /**
   * On the ground beside the truck, put aside for a while (user, 19.11.2026: "Van kamiona" as in
   * smartLoad). z is then from the truck's floor, so it is below 0. Only while editing: a plan is
   * saved with everything in the truck.
   */
  out?: boolean
}

/** The cargo space in cm. */
export interface EditSpace {
  L: number
  W: number
  H: number
}

export type ProblemKind = 'outside' | 'overlap' | 'unsupported' | 'order'

export interface LoadProblem {
  kind: ProblemKind
  text: string
  /** the shipments involved, the first is the one to look at */
  shipmentIds: number[]
}

/** Below this, two lengths are the same (cm). */
const EPS = 0.05

const keyOf = (p: Pick<Placement, 'shipmentId' | 'piece'>) => `${p.shipmentId}#${p.piece ?? 0}`

/** The plan's placements (mm) as pieces to edit (cm); `colors` by shipment. */
export function piecesFromPlacements(placements: Placement[], colors: ReadonlyMap<number, string>): EditPiece[] {
  return placements.map((p) => ({
    key: keyOf(p),
    shipmentId: p.shipmentId,
    ...(p.piece !== undefined ? { piece: p.piece } : {}),
    color: colors.get(p.shipmentId) ?? '#8899aa',
    x: p.xMm / 10,
    y: p.yMm / 10,
    z: p.zMm / 10,
    l: p.lengthMm / 10,
    w: p.widthMm / 10,
    h: p.heightMm / 10,
    rotated: p.rotated,
  }))
}

/** Back to placements, in whole mm, in the order of the pieces. */
export function placementsFromPieces(pieces: EditPiece[]): Placement[] {
  const mm = (cm: number) => Math.round(cm * 10) + 0
  return pieces.map((p) => ({
    shipmentId: p.shipmentId,
    xMm: mm(p.x),
    yMm: mm(p.y),
    zMm: mm(p.z),
    lengthMm: mm(p.l),
    widthMm: mm(p.w),
    heightMm: mm(p.h),
    rotated: p.rotated,
    ...(p.piece !== undefined ? { piece: p.piece } : {}),
  }))
}

/**
 * Whether `arranged` has the same pieces as `computed` (by shipment and piece, each once): the
 * same height and the same footprint, turned or not. Where they stand does not matter.
 */
export function samePieces(computed: Placement[], arranged: Placement[]): boolean {
  if (computed.length !== arranged.length) return false
  const byKey = new Map(computed.map((p) => [keyOf(p), p]))
  if (byKey.size !== computed.length) return false
  const seen = new Set<string>()
  const near = (a: number, b: number) => Math.abs(a - b) <= 1
  for (const p of arranged) {
    const key = keyOf(p)
    const c = byKey.get(key)
    if (!c || seen.has(key)) return false
    seen.add(key)
    const numbers = [p.xMm, p.yMm, p.zMm, p.lengthMm, p.widthMm, p.heightMm]
    if (!numbers.every(Number.isFinite)) return false
    const footprint =
      (near(p.lengthMm, c.lengthMm) && near(p.widthMm, c.widthMm)) || (near(p.lengthMm, c.widthMm) && near(p.widthMm, c.lengthMm))
    if (!footprint || !near(p.heightMm, c.heightMm)) return false
  }
  return true
}

/**
 * What a hand-made plan is valid for: the truck's deliveries in order (with their places). A
 * shipment moved to or from the truck, or a new order, makes the plan out of date.
 */
export function routeKey(route: RoutePlan): string {
  return route.stops
    .filter((s) => s.type === 'DELIVERY')
    .map((s) => `${s.shipmentId}@${s.locationId}`)
    .join('.')
}

export interface UnloadOrder {
  /** 1 = the first shipment off the truck, as the 3D screen numbers them */
  number: Map<number, number>
  /**
   * The stop it comes off at: deliveries one after another at the same place share it, since
   * they come off together (the route planner orders them freely).
   */
  visit: Map<number, number>
}

export function unloadOrder(route: RoutePlan): UnloadOrder {
  const number = new Map<number, number>()
  const visit = new Map<number, number>()
  let at: number | null = null
  let v = 0
  for (const stop of route.stops) {
    if (stop.type !== 'DELIVERY') {
      at = null
      continue
    }
    if (stop.locationId !== at) v += 1
    at = stop.locationId
    number.set(stop.shipmentId, number.size + 1)
    visit.set(stop.shipmentId, v)
  }
  return { number, visit }
}

function overlapLength(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

function footprintOverlap(a: EditPiece, b: EditPiece): number {
  return overlapLength(a.x, a.x + a.l, b.x, b.x + b.l) * overlapLength(a.y, a.y + a.w, b.y, b.y + b.w)
}

/** The occupied length (cm): where the furthest piece ends. */
export function occupiedLength(pieces: EditPiece[]): number {
  return pieces.reduce((m, p) => Math.max(m, p.x + p.l), 0)
}

/** Every piece of the shipments, and everything resting on them, directly or higher up. */
export function groupOf(pieces: EditPiece[], shipmentIds: Iterable<number>): Set<string> {
  const ids = new Set(shipmentIds)
  const group = new Set(pieces.filter((p) => ids.has(p.shipmentId)).map((p) => p.key))
  let grew = true
  while (grew) {
    grew = false
    for (const p of pieces) {
      if (group.has(p.key)) continue
      for (const q of pieces) {
        if (group.has(q.key) && Math.abs(p.z - (q.z + q.h)) < EPS && footprintOverlap(p, q) > EPS) {
          // A shipment goes as a whole: all its pieces join.
          for (const r of pieces) if (r.shipmentId === p.shipmentId) group.add(r.key)
          grew = true
          break
        }
      }
    }
  }
  return group
}

/** The shipments whose footprint covers the point, the highest first (picking from above). */
export function shipmentsAt(pieces: EditPiece[], x: number, y: number): number[] {
  const hits = pieces
    .filter((p) => x >= p.x && x <= p.x + p.l && y >= p.y && y <= p.y + p.w)
    .sort((a, b) => b.z + b.h - (a.z + a.h))
  return [...new Set(hits.map((p) => p.shipmentId))]
}

/** The footprint of a group (cm). */
export function extentOf(members: EditPiece[]) {
  return {
    minX: Math.min(...members.map((p) => p.x)),
    maxX: Math.max(...members.map((p) => p.x + p.l)),
    minY: Math.min(...members.map((p) => p.y)),
    maxY: Math.max(...members.map((p) => p.y + p.w)),
  }
}

/**
 * Puts a group down: its lowest pieces on the highest top under them (or the floor); the rest
 * keep their offsets.
 */
export function settle(pieces: EditPiece[], group: Set<string>): EditPiece[] {
  const members = pieces.filter((p) => group.has(p.key))
  if (members.length === 0) return pieces
  const others = pieces.filter((p) => !group.has(p.key))
  const bottom = Math.min(...members.map((p) => p.z))
  let floor = 0
  for (const m of members) {
    if (m.z - bottom > EPS) continue // only the bottom layer of the group decides
    for (const o of others) if (footprintOverlap(m, o) > EPS) floor = Math.max(floor, o.z + o.h)
  }
  const dz = floor - bottom
  return dz === 0 ? pieces : pieces.map((p) => (group.has(p.key) ? { ...p, z: p.z + dz } : p))
}

/** Moves a group by (dx, dy) and lets it down onto what is under its new footprint. */
export function moveGroup(pieces: EditPiece[], group: Set<string>, dx: number, dy: number): EditPiece[] {
  const moved = pieces.map((p) => (group.has(p.key) ? { ...p, x: p.x + dx, y: p.y + dy } : p))
  return settle(moved, group)
}

/**
 * Turns a group by 90° around the middle of the chosen shipment's footprint, then lets it down
 * again. What then reaches out of the cargo space shows as a problem, as in smartLoad. The plan
 * is kept in whole mm: with an odd size the middle is on half a millimetre, so the turned group
 * is shifted by that half (all of it the same way), or saving would round each piece on its own
 * and two shipments put edge to edge could overlap by a millimetre.
 */
export function rotateGroup(pieces: EditPiece[], group: Set<string>, shipmentId: number): EditPiece[] {
  const own = pieces.filter((p) => p.shipmentId === shipmentId)
  if (own.length === 0) return pieces
  const e = extentOf(own)
  const cx = (e.minX + e.maxX) / 2
  const cy = (e.minY + e.maxY) / 2
  const turned = pieces.map((p) => {
    if (!group.has(p.key)) return p
    const px = p.x + p.l / 2 - cx
    const py = p.y + p.w / 2 - cy
    const nx = cx - py
    const ny = cy + px
    return { ...p, l: p.w, w: p.l, x: nx - p.w / 2, y: ny - p.l / 2, rotated: !p.rotated }
  })
  const t = extentOf(turned.filter((p) => p.shipmentId === shipmentId))
  const sx = roundMm(t.minX) - t.minX
  const sy = roundMm(t.minY) - t.minY
  return settle(
    turned.map((p) => (group.has(p.key) ? { ...p, x: round(p.x + sx), y: round(p.y + sy) } : p)),
    group,
  )
}

function round(v: number): number {
  return Math.round(v * 100) / 100 + 0
}

/** cm to the nearest whole mm */
function roundMm(v: number): number {
  return Math.round(v * 10) / 10
}

/** Whether two plans of the same pieces have every piece where it was (and turned as it was). */
export function samePlaces(a: readonly EditPiece[], b: readonly EditPiece[]): boolean {
  if (a.length !== b.length) return false
  const near = (u: number, v: number) => Math.abs(u - v) < 1e-6
  return a.every((p, i) => {
    const q = b[i]
    return (
      p.key === q.key &&
      Boolean(p.out) === Boolean(q.out) &&
      p.rotated === q.rotated &&
      near(p.x, q.x) &&
      near(p.y, q.y) &&
      near(p.z, q.z) &&
      near(p.l, q.l) &&
      near(p.w, q.w)
    )
  })
}

/**
 * How far to move a group so its footprint starts near (x, y): whole centimetres, kept inside
 * the floor, and pulled to a wall or a neighbour's edge when one is within `reach` cm. With no
 * reach (the arrows) it goes exactly where it is sent, so a step is a step also from half a cm.
 */
export function snapMove(
  pieces: EditPiece[],
  group: Set<string>,
  x: number,
  y: number,
  space: EditSpace,
  reach = 5,
): { dx: number; dy: number } {
  const members = pieces.filter((p) => group.has(p.key))
  if (members.length === 0) return { dx: 0, dy: 0 }
  const e = extentOf(members)
  const l = e.maxX - e.minX
  const w = e.maxY - e.minY
  const others = pieces.filter((p) => !group.has(p.key))
  const xs = [0, space.L - l, ...others.flatMap((o) => [o.x + o.l, o.x - l, o.x, o.x + o.l - l])]
  const ys = [0, space.W - w, ...others.flatMap((o) => [o.y + o.w, o.y - w, o.y, o.y + o.w - w])]
  const pick = (v: number, candidates: number[]) => {
    let best = reach > 0 ? Math.round(v) : v
    let dist = reach + EPS
    for (const c of candidates) {
      const d = Math.abs(c - v)
      if (d < dist) {
        dist = d
        best = c
      }
    }
    return best
  }
  // Kept inside; a group longer (or wider) than the space stays at the front wall (right side).
  const nx = Math.max(0, Math.min(pick(x, xs), space.L - l))
  const ny = Math.max(0, Math.min(pick(y, ys), space.W - w))
  return { dx: round(nx - e.minX), dy: round(ny - e.minY) }
}

/**
 * Everything that breaks a loading rule, by shipment: it reaches out of the cargo space, two
 * shipments overlap, a shipment above the floor does not rest fully on what is below it (the
 * rules of smartLoad), and loading from the rear (D2): a shipment that comes off earlier must not
 * have one that comes off later on it or between it and the doors.
 */
export function checkLoad(
  pieces: EditPiece[],
  space: EditSpace,
  order: UnloadOrder,
  name: (shipmentId: number) => string,
): LoadProblem[] {
  const out: LoadProblem[] = []
  const reported = new Set<string>()
  const add = (kind: ProblemKind, ids: number[], text: string) => {
    const key = `${kind}:${ids.join(',')}`
    if (reported.has(key)) return
    reported.add(key)
    out.push({ kind, text, shipmentIds: ids })
  }
  for (const a of pieces) {
    if (a.x < -EPS || a.y < -EPS || a.z < -EPS || a.x + a.l > space.L + EPS || a.y + a.w > space.W + EPS || a.z + a.h > space.H + EPS) {
      add('outside', [a.shipmentId], `${name(a.shipmentId)} izlazi iz tovarnog prostora.`)
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]
      const b = pieces[j]
      // The pieces of one shipment are as smartLoad+ placed them.
      if (a.shipmentId === b.shipmentId) continue
      if (
        overlapLength(a.x, a.x + a.l, b.x, b.x + b.l) > EPS &&
        overlapLength(a.y, a.y + a.w, b.y, b.y + b.w) > EPS &&
        overlapLength(a.z, a.z + a.h, b.z, b.z + b.h) > EPS
      ) {
        const ids = [a.shipmentId, b.shipmentId].sort((p, q) => p - q)
        add('overlap', ids, `${name(ids[0])} i ${name(ids[1])} se preklapaju.`)
      }
    }
  }
  // Support, per shipment: the share of the base of its pieces above the floor that rests on something.
  const base = new Map<number, { area: number; covered: number }>()
  for (const a of pieces) {
    if (a.z <= EPS) continue
    let covered = 0
    for (const b of pieces) {
      if (b === a || Math.abs(b.z + b.h - a.z) > EPS) continue
      covered += footprintOverlap(a, b)
    }
    const s = base.get(a.shipmentId) ?? { area: 0, covered: 0 }
    s.area += a.l * a.w
    s.covered += Math.min(covered, a.l * a.w)
    base.set(a.shipmentId, s)
  }
  for (const [id, s] of base) {
    if (s.covered < s.area - 1) {
      add('unsupported', [id], `${name(id)} nema pun oslonac (${Math.round((100 * s.covered) / s.area)} % osnove).`)
    }
  }
  // Loading from the rear: what comes off earlier (a) must get out through the doors.
  for (const a of pieces) {
    const va = order.visit.get(a.shipmentId)
    if (va === undefined) continue
    for (const b of pieces) {
      const vb = order.visit.get(b.shipmentId)
      if (vb === undefined || vb <= va) continue
      const across = overlapLength(a.y, a.y + a.w, b.y, b.y + b.w) > EPS
      const along = overlapLength(a.x, a.x + a.l, b.x, b.x + b.l) > EPS
      const onTop = across && along && b.z >= a.z + a.h - EPS
      const inTheWay = across && overlapLength(a.z, a.z + a.h, b.z, b.z + b.h) > EPS && b.x >= a.x + a.l - EPS
      if (onTop || inTheWay) {
        const na = order.number.get(a.shipmentId)
        const nb = order.number.get(b.shipmentId)
        add(
          'order',
          [a.shipmentId, b.shipmentId],
          `${name(a.shipmentId)} (istovar ${na}.) ne može da izađe: ${onTop ? 'na njoj je' : 'ispred nje, ka vratima, je'} ${name(b.shipmentId)} (istovar ${nb}.).`,
        )
      }
    }
  }
  return out
}

/**
 * The warnings of a plan arranged by hand: the computed plan's, except where its row would end
 * (that says nothing about the arranged one), and every broken rule.
 */
export function arrangedWarnings(computed: string[], problems: LoadProblem[]): string[] {
  return [...computed.filter((w) => !w.startsWith(LONGER_THAN_SPACE)), ...problems.map((p) => `Ručno uređen raspored: ${p.text}`)]
}
