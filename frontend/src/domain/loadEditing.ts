import type { Placement, RoutePlan } from '../api/types'
import { LONGER_THAN_SPACE } from './optimization/loadPlan'

// A truck's load plan arranged by hand (user, 19.11.2026: "Uredi" on the 3D screen, as the
// layout editor of smartLoad, F:\GitHubProjects\smartLoad, frontend/src/editor/plan.ts). The
// moves are taken over from there. What moves is one body, with whatever rests on it: a
// shipment's block, or one package of a shipment whose layout came from smartLoad+ (user,
// 20.11.2026: "svaki paket nakon importa treba da bude posebno telo"; until then the whole
// shipment moved).
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
  /** the bodies involved (EditPiece.key), the first is the one to look at */
  keys: string[]
}

/** Below this, two lengths are the same (cm). */
const EPS = 0.05

const keyOf = (p: Pick<Placement, 'shipmentId' | 'piece'>) => `${p.shipmentId}#${p.piece ?? 0}`

/** How a body is called: the shipment, and for a package from smartLoad+ its number ("S-103, paket 4"). */
export function pieceLabel(name: (shipmentId: number) => string): (p: Pick<EditPiece, 'shipmentId' | 'piece'>) => string {
  return (p) => (p.piece !== undefined ? `${name(p.shipmentId)}, paket ${p.piece}` : name(p.shipmentId))
}

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

/** The bodies (by key), and everything resting on them, directly or higher up. */
export function groupOf(pieces: EditPiece[], keys: Iterable<string>): Set<string> {
  const group = new Set(keys)
  let grew = true
  while (grew) {
    grew = false
    for (const p of pieces) {
      if (group.has(p.key)) continue
      for (const q of pieces) {
        if (group.has(q.key) && Math.abs(p.z - (q.z + q.h)) < EPS && footprintOverlap(p, q) > EPS) {
          group.add(p.key)
          grew = true
          break
        }
      }
    }
  }
  return group
}

/** The bodies whose footprint covers the point, the highest first (picking from above). */
export function piecesAt(pieces: EditPiece[], x: number, y: number): string[] {
  return pieces
    .filter((p) => x >= p.x && x <= p.x + p.l && y >= p.y && y <= p.y + p.w)
    .sort((a, b) => b.z + b.h - (a.z + a.h))
    .map((p) => p.key)
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
 * keep their offsets. A group on the ground beside the truck lands on the ground (`groundZ`, from
 * the truck's floor) or on what else is on the ground there.
 */
export function settle(pieces: EditPiece[], group: Set<string>, groundZ = 0): EditPiece[] {
  const members = pieces.filter((p) => group.has(p.key))
  if (members.length === 0) return pieces
  const outside = members.some((p) => p.out)
  const others = pieces.filter((p) => !group.has(p.key) && Boolean(p.out) === outside)
  const bottom = Math.min(...members.map((p) => p.z))
  let floor = outside ? groundZ : 0
  for (const m of members) {
    if (m.z - bottom > EPS) continue // only the bottom layer of the group decides
    for (const o of others) if (footprintOverlap(m, o) > EPS) floor = Math.max(floor, o.z + o.h)
  }
  const dz = floor - bottom
  return dz === 0 ? pieces : pieces.map((p) => (group.has(p.key) ? { ...p, z: p.z + dz } : p))
}

/** Moves a group by (dx, dy) and lets it down onto what is under its new footprint. */
export function moveGroup(pieces: EditPiece[], group: Set<string>, dx: number, dy: number, groundZ = 0): EditPiece[] {
  const moved = pieces.map((p) => (group.has(p.key) ? { ...p, x: p.x + dx, y: p.y + dy } : p))
  return settle(moved, group, groundZ)
}

/**
 * Turns a group by 90° around the middle of the chosen body's footprint, then lets it down
 * again. What then reaches out of the cargo space shows as a problem, as in smartLoad. The plan
 * is kept in whole mm: with an odd size the middle is on half a millimetre, so the turned group
 * is shifted by that half (all of it the same way), or saving would round each piece on its own
 * and two shipments put edge to edge could overlap by a millimetre.
 */
export function rotateGroup(pieces: EditPiece[], group: Set<string>, key: string, groundZ = 0): EditPiece[] {
  const own = pieces.filter((p) => p.key === key)
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
  const t = extentOf(turned.filter((p) => p.key === key))
  const sx = roundMm(t.minX) - t.minX
  const sy = roundMm(t.minY) - t.minY
  return settle(
    turned.map((p) => (group.has(p.key) ? { ...p, x: round(p.x + sx), y: round(p.y + sy) } : p)),
    group,
    groundZ,
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
  // In the truck: what is on the ground beside it is no wall or neighbour.
  const others = pieces.filter((p) => !group.has(p.key) && !p.out)
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
 * The ground around the truck in plan cm, where shipments may be put aside while the plan is
 * being arranged (user, 19.11.2026: "Van kamiona" as in smartLoad): where it ends, the truck's
 * own footprint that stays clear (cab to bumper, wheels), and the ground below the truck's floor.
 * The 3D view knows the truck's shape, so it gives these (yardOf in features/truck-3d/scene.ts).
 */
export interface Yard {
  minX: number
  maxX: number
  minY: number
  maxY: number
  truck: { minX: number; maxX: number; minY: number; maxY: number }
  groundZ: number
}

/** The pieces in the truck (not those on the ground beside it). */
export function inTruck(pieces: EditPiece[]): EditPiece[] {
  return pieces.some((p) => p.out) ? pieces.filter((p) => !p.out) : pieces
}

/**
 * What is on the ground beside the truck, one row per shipment (its packages from smartLoad+
 * together, as smartLoad puts the same goods in one row with a count), in the order of the plan.
 */
export function asideRows(pieces: EditPiece[]): { shipmentId: number; keys: string[] }[] {
  const rows = new Map<number, string[]>()
  for (const p of pieces) if (p.out) rows.set(p.shipmentId, [...(rows.get(p.shipmentId) ?? []), p.key])
  return [...rows].map(([shipmentId, keys]) => ({ shipmentId, keys }))
}

/**
 * Dragging in the 3D view: a group whose footprint's middle is over the truck goes into it
 * (stuck to walls and neighbours and kept inside, as before); over the ground around it, it is
 * put down on the ground. (x, y) is where the group's footprint should start.
 */
export function dragTo(pieces: EditPiece[], group: Set<string>, x: number, y: number, space: EditSpace, yard: Yard): EditPiece[] {
  const members = pieces.filter((p) => group.has(p.key))
  if (members.length === 0) return pieces
  const e = extentOf(members)
  const cx = x + (e.maxX - e.minX) / 2
  const cy = y + (e.maxY - e.minY) / 2
  const t = yard.truck
  if (cx >= t.minX && cx <= t.maxX && cy >= t.minY && cy <= t.maxY) {
    const into = pieces.map((p) => (group.has(p.key) && p.out ? { ...p, out: false } : p))
    const at = snapMove(into, group, x, y, space)
    return moveGroup(into, group, at.dx, at.dy)
  }
  return putOnGround(pieces, group, x, y, yard)
}

/**
 * The group on the ground with its footprint starting near (x, y), in whole cm: inside the
 * ground's edge and off the truck (out the shortest way: front, rear or a side).
 */
export function putOnGround(pieces: EditPiece[], group: Set<string>, x: number, y: number, yard: Yard): EditPiece[] {
  const members = pieces.filter((p) => group.has(p.key))
  if (members.length === 0) return pieces
  const e = extentOf(members)
  const l = e.maxX - e.minX
  const w = e.maxY - e.minY
  let nx = Math.round(Math.min(Math.max(x, yard.minX), yard.maxX - l))
  let ny = Math.round(Math.min(Math.max(y, yard.minY), yard.maxY - w))
  const t = yard.truck
  const gap = 10
  if (nx + l > t.minX && nx < t.maxX && ny + w > t.minY && ny < t.maxY) {
    const ways = [
      { d: nx + l - (t.minX - gap), x: t.minX - gap - l, y: ny },
      { d: t.maxX + gap - nx, x: t.maxX + gap, y: ny },
      { d: ny + w - (t.minY - gap), x: nx, y: t.minY - gap - w },
      { d: t.maxY + gap - ny, x: nx, y: t.maxY + gap },
    ].sort((a, b) => a.d - b.d)
    nx = ways[0].x
    ny = ways[0].y
  }
  const outside = pieces.map((p) => (group.has(p.key) && !p.out ? { ...p, out: true } : p))
  return moveGroup(outside, group, nx - e.minX, ny - e.minY, yard.groundZ)
}

/**
 * A body from the ground back into the truck ("Ubaci"), at the first place from the front wall
 * where it breaks no rule (smartLoad: "najbliže čelu"): on the floor or on what is there, as it
 * is or turned by 90°. The rules include the order of unloading, so a shipment that comes off
 * early ends up nearer the doors by itself. Null when there is no such place. What stood on it on
 * the ground comes down.
 */
export function placeFromFront(
  pieces: EditPiece[],
  key: string,
  space: EditSpace,
  order: UnloadOrder,
  yard: Yard,
): EditPiece[] | null {
  const own = pieces.filter((p) => p.key === key)
  if (own.length === 0) return null
  const inside = pieces.filter((p) => !p.out && p.key !== key)
  const label = (id: number) => String(id)
  const keys = new Set([key])
  const xs = [...new Set([0, ...inside.map((o) => o.x + o.l)])].sort((a, b) => a - b)
  let best: { x: number; y: number; z: number; placed: EditPiece[] } | null = null
  for (const turned of [false, true]) {
    // The body on the floor, its footprint from (0, 0).
    const level = own.map((p) => ({ ...p, out: false }))
    const shape = turned ? rotateGroup(level, keys, key) : settle(level, keys)
    const e = extentOf(shape)
    const l = e.maxX - e.minX
    const w = e.maxY - e.minY
    const ys = [...new Set([0, space.W - w, ...inside.flatMap((o) => [o.y + o.w, o.y - w])])]
      .filter((y) => y >= -EPS && y + w <= space.W + EPS)
      .sort((a, b) => a - b)
    for (const x of xs) {
      if (best && x > best.x + EPS) break // further back can no longer be nearer the front
      if (x + l > space.L + EPS) break
      for (const y of ys) {
        const moved = shape.map((p) => ({ ...p, x: round(p.x - e.minX + x), y: round(p.y - e.minY + y) }))
        const placed = settle([...inside, ...moved], keys).filter((p) => keys.has(p.key))
        // Too high on what is there: no need for all the rules.
        if (placed.some((p) => p.z + p.h > space.H + EPS)) continue
        const z = Math.min(...placed.map((p) => p.z))
        if (best && Math.abs(x - best.x) <= EPS && (z > best.z + EPS || (Math.abs(z - best.z) <= EPS && y >= best.y))) continue
        // Every problem a new body brings names it (and it cannot take one away: it is put on top).
        const after = checkLoad([...inside, ...placed], space, order, label)
        if (!after.some((p) => p.keys.includes(key))) best = { x, y, z, placed }
      }
    }
  }
  if (!best) return null
  const byKey = new Map(best.placed.map((p) => [p.key, p]))
  let out = pieces.map((p) => byKey.get(p.key) ?? p)
  // What stood on it on the ground comes down (lowest first, each onto what is below it).
  for (const p of out.filter((q) => q.out).sort((a, b) => a.z - b.z)) out = dropDown(out, p.key, yard.groundZ)
  return out
}

/**
 * One piece on the ground falls onto what is really below it (the ground, or a piece under it).
 * Unlike settle, what is above it does not count: a piece carrying another stays where it is.
 */
function dropDown(pieces: EditPiece[], key: string, groundZ: number): EditPiece[] {
  const p = pieces.find((q) => q.key === key)
  if (!p) return pieces
  let floor = groundZ
  for (const o of pieces) {
    if (o === p || !o.out) continue
    if (o.z + o.h <= p.z + EPS && footprintOverlap(p, o) > EPS) floor = Math.max(floor, o.z + o.h)
  }
  return Math.abs(floor - p.z) <= EPS ? pieces : pieces.map((q) => (q === p ? { ...q, z: floor } : q))
}

/**
 * Everything that breaks a loading rule, by body (a shipment's block, or one of its packages
 * from smartLoad+): it reaches out of the cargo space, two bodies overlap (two packages of one
 * shipment too, since each moves on its own), a body above the floor does not rest fully on what
 * is below it (the rules of smartLoad), and loading from the rear (D2): a shipment that comes off
 * earlier must not have one that comes off later on it or between it and the doors (said once
 * per pair of shipments, with all the bodies in the way).
 */
export function checkLoad(
  pieces: EditPiece[],
  space: EditSpace,
  order: UnloadOrder,
  name: (shipmentId: number) => string,
): LoadProblem[] {
  const label = pieceLabel(name)
  const out: LoadProblem[] = []
  const reported = new Map<string, LoadProblem>()
  const add = (kind: ProblemKind, id: string, involved: EditPiece[], text: string) => {
    const seen = reported.get(`${kind}:${id}`)
    if (seen) {
      for (const p of involved) if (!seen.keys.includes(p.key)) seen.keys.push(p.key)
      return
    }
    const problem = { kind, text, shipmentIds: [...new Set(involved.map((p) => p.shipmentId))], keys: involved.map((p) => p.key) }
    reported.set(`${kind}:${id}`, problem)
    out.push(problem)
  }
  for (const a of pieces) {
    if (a.x < -EPS || a.y < -EPS || a.z < -EPS || a.x + a.l > space.L + EPS || a.y + a.w > space.W + EPS || a.z + a.h > space.H + EPS) {
      add('outside', a.key, [a], `${label(a)} izlazi iz tovarnog prostora.`)
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]
      const b = pieces[j]
      if (
        overlapLength(a.x, a.x + a.l, b.x, b.x + b.l) > EPS &&
        overlapLength(a.y, a.y + a.w, b.y, b.y + b.w) > EPS &&
        overlapLength(a.z, a.z + a.h, b.z, b.z + b.h) > EPS
      ) {
        add('overlap', `${a.key},${b.key}`, [a, b], `${label(a)} i ${label(b)} se preklapaju.`)
      }
    }
  }
  // Support: the share of the base of a body above the floor that rests on something.
  for (const a of pieces) {
    if (a.z <= EPS) continue
    let covered = 0
    for (const b of pieces) {
      if (b === a || Math.abs(b.z + b.h - a.z) > EPS) continue
      covered += footprintOverlap(a, b)
    }
    const area = a.l * a.w
    if (covered < area - 1) {
      add('unsupported', a.key, [a], `${label(a)} nema pun oslonac (${Math.round((100 * Math.min(covered, area)) / area)} % osnove).`)
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
          `${a.shipmentId},${b.shipmentId}`,
          [a, b],
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
