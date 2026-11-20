import { describe, expect, it } from 'vitest'
import type { Placement, RoutePlan, RouteStop, Shipment } from '../../src/api/types'
import {
  arrangedWarnings,
  checkLoad,
  dragTo,
  groupOf,
  inTruck,
  moveGroup,
  occupiedLength,
  piecesFromPlacements,
  placeFromFront,
  placementsFromPieces,
  putOnGround,
  rotateGroup,
  shipmentsAside,
  routeKey,
  samePieces,
  samePlaces,
  shipmentsAt,
  snapMove,
  unloadOrder,
  type EditPiece,
} from '../../src/domain/loadEditing'
import { rearLoadedPlan } from '../../src/domain/optimization/loadPlan'
import { truckExtent, usedLength, yardOf } from '../../src/features/truck-3d/scene'

// Invented cargo space and shipments (cm in the editor, mm in the API).
const SPACE = { L: 1360, W: 248, H: 270 }

function piece(shipmentId: number, x: number, y: number, z: number, l: number, w: number, h: number, n?: number): EditPiece {
  return { key: `${shipmentId}#${n ?? 0}`, shipmentId, ...(n ? { piece: n } : {}), color: '#888', x, y, z, l, w, h, rotated: false }
}

function stop(type: RouteStop['type'], shipmentId: number, locationId: number): RouteStop {
  return { sequence: 0, type, shipmentId, locationId, loadAfterLdmTenths: 0, legMeters: 0 }
}

/** Picks up 1, 2, 3; delivers 1 at place 20, then 2 and 3 together at place 30. */
const ROUTE: RoutePlan = {
  truckId: 7,
  usedLdmTenths: 0,
  totalMeters: 0,
  stops: [stop('PICKUP', 1, 10), stop('PICKUP', 2, 10), stop('PICKUP', 3, 11), stop('DELIVERY', 1, 20), stop('DELIVERY', 2, 30), stop('DELIVERY', 3, 30)],
}
const ORDER = unloadOrder(ROUTE)
const name = (id: number) => `P${id}`

describe('load plan arranged by hand: pieces and placements', () => {
  const placements: Placement[] = [
    { shipmentId: 1, xMm: 0, yMm: 0, zMm: 0, lengthMm: 1200, widthMm: 800, heightMm: 1500, rotated: false },
    { shipmentId: 2, xMm: 1200, yMm: 0, zMm: 0, lengthMm: 600, widthMm: 400, heightMm: 900, rotated: true, piece: 1 },
    { shipmentId: 2, xMm: 1200, yMm: 400, zMm: 0, lengthMm: 600, widthMm: 400, heightMm: 900, rotated: false, piece: 2 },
  ]

  it('goes to cm and back to the same whole mm', () => {
    const pieces = piecesFromPlacements(placements, new Map([[1, '#111111']]))
    expect(pieces[0]).toMatchObject({ key: '1#0', x: 0, l: 120, w: 80, h: 150, color: '#111111' })
    expect(pieces[1]).toMatchObject({ key: '2#1', piece: 1, x: 120, rotated: true, color: '#8899aa' })
    expect(placementsFromPieces(pieces)).toEqual(placements)
    // A centimetre and a half is 15 mm, never 14.999…
    expect(placementsFromPieces([{ ...pieces[0], x: 0.1 + 0.2 }])[0].xMm).toBe(3)
  })

  it('knows the same pieces wherever they stand, turned or not', () => {
    const moved = placements.map((p) => ({ ...p, xMm: p.xMm + 500, zMm: 100 }))
    expect(samePieces(placements, moved)).toBe(true)
    const turned = [{ ...placements[0], lengthMm: 800, widthMm: 1200 }, ...placements.slice(1)]
    expect(samePieces(placements, turned)).toBe(true)
    expect(samePieces(placements, [...placements].reverse())).toBe(true)

    expect(samePieces(placements, placements.slice(1))).toBe(false)
    expect(samePieces(placements, [placements[0], placements[1], placements[1]])).toBe(false)
    expect(samePieces(placements, [{ ...placements[0], heightMm: 1600 }, ...placements.slice(1)])).toBe(false)
    expect(samePieces(placements, [{ ...placements[0], lengthMm: 1000 }, ...placements.slice(1)])).toBe(false)
    expect(samePieces(placements, [{ ...placements[0], shipmentId: 9 }, ...placements.slice(1)])).toBe(false)
    expect(samePieces(placements, [{ ...placements[0], xMm: Number.NaN }, ...placements.slice(1)])).toBe(false)
  })

  it('keys a plan by the deliveries, and numbers them as they come off', () => {
    expect(routeKey(ROUTE)).toBe('1@20.2@30.3@30')
    // The pickups do not matter, the order of the deliveries does.
    expect(routeKey({ ...ROUTE, stops: [ROUTE.stops[1], ROUTE.stops[0], ...ROUTE.stops.slice(2)] })).toBe(routeKey(ROUTE))
    expect(routeKey({ ...ROUTE, stops: [...ROUTE.stops.slice(0, 3), ROUTE.stops[4], ROUTE.stops[3], ROUTE.stops[5]] })).not.toBe(routeKey(ROUTE))
    expect([...ORDER.number]).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    // 2 and 3 come off at the same stop.
    expect([...ORDER.visit]).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
    ])
  })
})

describe('load plan arranged by hand: moves', () => {
  // 1 is two pieces side by side; 2 stands on 1's first piece; 3 stands alone further back.
  const pieces = [
    piece(1, 0, 0, 0, 100, 100, 100, 1),
    piece(1, 0, 100, 0, 100, 100, 100, 2),
    piece(2, 0, 0, 100, 80, 80, 50),
    piece(3, 300, 0, 0, 120, 100, 120),
  ]

  it('moves a whole shipment with what rests on it', () => {
    expect([...groupOf(pieces, [1])].sort()).toEqual(['1#1', '1#2', '2#0'])
    expect([...groupOf(pieces, [2])]).toEqual(['2#0'])
    expect([...groupOf(pieces, [3])]).toEqual(['3#0'])
    const moved = moveGroup(pieces, groupOf(pieces, [1]), 500, 20)
    expect(moved.map((p) => [p.key, p.x, p.y, p.z])).toEqual([
      ['1#1', 500, 20, 0],
      ['1#2', 500, 120, 0],
      ['2#0', 500, 20, 100],
      ['3#0', 300, 0, 0],
    ])
  })

  it('takes every level of a stack along, listed in any order', () => {
    // 5 on 4 on 3: 5 comes first in the list, so one pass over it is not enough.
    const stack = [piece(5, 300, 0, 170, 50, 50, 20), piece(4, 300, 0, 120, 100, 100, 50), ...pieces]
    expect([...groupOf(stack, [3])].sort()).toEqual(['3#0', '4#0', '5#0'])
    expect([...groupOf(stack, [4])].sort()).toEqual(['4#0', '5#0'])
  })

  it('puts a shipment down on the highest top under it, and back on the floor', () => {
    const onThree = moveGroup(pieces, groupOf(pieces, [2]), 300, 0)
    expect(onThree.find((p) => p.shipmentId === 2)).toMatchObject({ x: 300, z: 120 })
    const down = moveGroup(onThree, groupOf(onThree, [2]), 200, 0)
    expect(down.find((p) => p.shipmentId === 2)).toMatchObject({ x: 500, z: 0 })
  })

  it('picks from above: the highest first', () => {
    expect(shipmentsAt(pieces, 40, 40)).toEqual([2, 1])
    expect(shipmentsAt(pieces, 50, 150)).toEqual([1])
    expect(shipmentsAt(pieces, 200, 50)).toEqual([])
  })

  it('sticks to walls and neighbours within 5 cm, in whole cm, and stays inside', () => {
    const three = groupOf(pieces, [3])
    // Near the doors (L - l = 1240): pulled there.
    expect(snapMove(pieces, three, 1236.4, 0, SPACE)).toEqual({ dx: 940, dy: 0 })
    // Near 1's back edge (x = 100): pulled to touch it.
    expect(snapMove(pieces, three, 103, 40.6, SPACE)).toEqual({ dx: -200, dy: 41 })
    // Beyond the walls: kept inside.
    expect(snapMove(pieces, three, 2000, 500, SPACE)).toEqual({ dx: 940, dy: 148 })
    expect(snapMove(pieces, three, -50, -50, SPACE)).toEqual({ dx: -300, dy: 0 })
    // With no reach (the arrows), it goes where it is sent.
    expect(snapMove(pieces, three, 103, 0, SPACE, 0)).toEqual({ dx: -197, dy: 0 })
  })

  it('turns a shipment by 90° around its middle, with what rests on it', () => {
    const turned = rotateGroup(pieces, groupOf(pieces, [3]), 3)
    expect(turned.find((p) => p.shipmentId === 3)).toMatchObject({ x: 310, y: -10, l: 100, w: 120, rotated: true })
    const both = rotateGroup(pieces, groupOf(pieces, [1]), 1)
    // 1's footprint was 100 × 200 around (50, 100); turned it is 200 × 100 around the same point.
    const own = both.filter((p) => p.shipmentId === 1)
    expect(own.map((p) => [p.x, p.y, p.l, p.w])).toEqual([
      [50, 50, 100, 100],
      [-50, 50, 100, 100],
    ])
    expect(both.find((p) => p.shipmentId === 2)).toMatchObject({ l: 80, w: 80, z: 100, rotated: true })
    expect(occupiedLength(turned)).toBe(410)
  })

  it('turns to whole mm, so saving shows no overlap the editor did not', () => {
    // Odd sizes in mm put the middle on half a millimetre; the plan is saved in whole mm.
    let random = 7
    const next = () => {
      random = (random * 1103515245 + 12345) % 2147483648
      return random / 2147483648
    }
    const size = () => (500 + Math.floor(next() * 900)) / 10
    const shown: string[] = []
    for (let i = 0; i < 400; i++) {
      let plan = [piece(1, 200, 20, 0, size(), size(), 100), piece(2, 700, 0, 0, size(), size(), 100)]
      plan = rotateGroup(plan, groupOf(plan, [1]), 1)
      for (const p of plan) expect(Math.abs(p.x * 10 - Math.round(p.x * 10))).toBeLessThan(1e-6)
      // 2 pulled against 1's far end, as a drag does within 5 cm.
      const one = plan[0]
      const two = groupOf(plan, [2])
      const at = snapMove(plan, two, one.x + one.l + 2, one.y, SPACE)
      plan = moveGroup(plan, two, at.dx, at.dy)
      const before = checkLoad(plan, SPACE, ORDER, name).map((p) => p.text)
      const saved = piecesFromPlacements(placementsFromPieces(plan), new Map())
      const after = checkLoad(saved, SPACE, ORDER, name).map((p) => p.text)
      if (after.join() !== before.join()) shown.push(`${i}: ${after.join(' ')}`)
    }
    expect(shown).toEqual([])
  })

  it('moves by the arrows exactly by the step, also from half a centimetre', () => {
    const half = [piece(3, 300.5, 0.5, 0, 120, 100, 120)]
    const three = groupOf(half, [3])
    expect(snapMove(half, three, 301.5, 0.5, SPACE, 0)).toEqual({ dx: 1, dy: 0 })
    expect(snapMove(half, three, 300.5, 10.5, SPACE, 0)).toEqual({ dx: 0, dy: 10 })
    // and still not past the walls
    expect(snapMove(half, three, -4.5, 0.5, SPACE, 0)).toEqual({ dx: -300.5, dy: 0 })
  })

  it('knows a move that puts everything back where it was', () => {
    const back = moveGroup(pieces, groupOf(pieces, [3]), 0, 0)
    expect(samePlaces(pieces, back)).toBe(true)
    expect(samePlaces(pieces, moveGroup(pieces, groupOf(pieces, [3]), 1, 0))).toBe(false)
    expect(samePlaces(pieces, rotateGroup(pieces, groupOf(pieces, [3]), 3))).toBe(false)
  })
})

describe('load plan arranged by hand: on the ground beside the truck', () => {
  // A semi-trailer of 13.6 m: the cab is 275 cm in front of the front wall, the floor 115 cm up.
  const YARD = yardOf(SPACE)
  const three = [piece(3, 300, 0, 0, 120, 100, 120)]

  it('knows the ground around the truck', () => {
    expect(YARD).toEqual({
      minX: -425,
      maxX: 1810,
      minY: -320,
      maxY: 568,
      truck: { minX: -275, maxX: 1375, minY: -16, maxY: 264 },
      groundZ: -115,
    })
    // The editor's 3D view has it in the picture.
    expect(truckExtent({ ...SPACE, yard: true })).toMatchObject({ minX: -425, maxX: 1810, minZ: -320, maxZ: 568 })
    expect(truckExtent(SPACE)).toMatchObject({ minX: -275, maxX: 1375 })
    // The occupied length in 3D is the truck's.
    expect(usedLength([piece(1, 0, 0, 0, 300, 100, 100), { ...piece(2, 1500, 0, -115, 200, 100, 100), out: true }])).toBe(300)
  })

  it('puts a shipment dragged off the truck on the ground, off the truck and inside the edge', () => {
    // Behind the doors.
    const down = dragTo(three, groupOf(three, [3]), 1500, 0, SPACE, YARD)
    expect(down[0]).toMatchObject({ out: true, x: 1500, y: 0, z: -115 })
    expect(inTruck(down)).toEqual([])
    expect(shipmentsAside(down)).toEqual([3])
    expect(checkLoad(inTruck(down), SPACE, ORDER, name)).toEqual([])
    // Half over the truck's side: out the shortest way (to the left side, 10 cm off the wheels).
    expect(putOnGround(three, groupOf(three, [3]), 600, 200, YARD)[0]).toMatchObject({ out: true, x: 600, y: 274 })
    // Beyond the edge: kept inside it.
    expect(putOnGround(three, groupOf(three, [3]), 5000, 5000, YARD)[0]).toMatchObject({ x: 1690, y: 468 })
    // Back over the truck: in it again, on the floor, stuck to the wall within 5 cm.
    const back = dragTo(down, groupOf(down, [3]), 3, 40, SPACE, YARD)
    expect(back[0]).toMatchObject({ out: false, x: 0, y: 40, z: 0 })
  })

  it('stacks on the ground, and what stands there goes along', () => {
    const one = putOnGround([...three, piece(4, 0, 0, 0, 60, 60, 50)], new Set(['3#0']), 1500, 0, YARD)
    const both = putOnGround(one, new Set(['4#0']), 1510, 10, YARD)
    expect(both.find((p) => p.shipmentId === 4)).toMatchObject({ out: true, z: -115 + 120 })
    expect([...groupOf(both, [3])].sort()).toEqual(['3#0', '4#0'])
    // What is on the ground is no wall or neighbour in the truck.
    const four = new Set(['4#0'])
    expect(snapMove([piece(4, 0, 0, 0, 60, 60, 50), { ...three[0], out: true, x: 63 }], four, 2, 0, SPACE)).toEqual({ dx: 0, dy: 0 })
    expect(samePlaces(three, [{ ...three[0], out: true }])).toBe(false)
  })

  it('puts a shipment back at the first place from the front that breaks no rule, turned if need be', () => {
    // 2 at the front wall, 1 (comes off first) at the doors, a gap of 1 m between them; 3 on the
    // ground with 4 on it. 3 is 2 m long: only turned does it fit the gap.
    const plan = [
      piece(2, 0, 0, 0, 500, 248, 270),
      piece(1, 600, 0, 0, 760, 248, 270),
      { ...piece(3, 1500, 0, -115, 200, 100, 100), out: true },
      { ...piece(4, 1500, 0, -15, 50, 50, 50), out: true },
    ]
    const placed = placeFromFront(plan, 3, SPACE, ORDER, YARD)
    expect(placed?.find((p) => p.shipmentId === 3)).toMatchObject({ out: false, x: 500, y: 0, z: 0, l: 100, w: 200, rotated: true })
    expect(checkLoad(inTruck(placed!), SPACE, ORDER, name)).toEqual([])
    // 4 has nothing under it any more.
    expect(placed?.find((p) => p.shipmentId === 4)).toMatchObject({ out: true, z: -115 })
  })

  it('keeps to the order of unloading, and says when there is no place', () => {
    // Only 2 in the truck: 1 goes right behind it (it comes off first, nothing is behind it).
    const plan = [
      piece(2, 0, 0, 0, 400, 248, 270),
      { ...piece(1, 1500, 0, -115, 200, 248, 270), out: true },
      { ...piece(3, 1500, 300, -115, 200, 248, 270), out: true },
    ]
    const withOne = placeFromFront(plan, 1, SPACE, ORDER, YARD)!
    expect(withOne.find((p) => p.shipmentId === 1)).toMatchObject({ out: false, x: 400 })
    // The nearest to the front of all the places that would do (behind 5 there is room too).
    const five = [...plan, piece(5, 900, 0, 0, 100, 248, 270)]
    expect(placeFromFront(five, 1, SPACE, ORDER, YARD)?.find((p) => p.shipmentId === 1)).toMatchObject({ x: 400 })
    // Nothing breaks a rule, whatever was there before: 5 sticking out of the doors stays its own problem.
    const out = [...plan, piece(5, 1300, 0, 0, 100, 248, 270)]
    expect(placeFromFront(out, 1, SPACE, ORDER, YARD)?.find((p) => p.shipmentId === 1)).toMatchObject({ x: 400 })
    // 3 comes off after 1, so it may not stand between 1 and the doors: no place that breaks no rule.
    expect(placeFromFront(withOne, 3, SPACE, ORDER, YARD)).toBeNull()
    // 3 first, then 1 behind it towards the doors: both fit.
    const withThree = placeFromFront(plan, 3, SPACE, ORDER, YARD)!
    expect(withThree.find((p) => p.shipmentId === 3)).toMatchObject({ out: false, x: 400 })
    expect(placeFromFront(withThree, 1, SPACE, ORDER, YARD)?.find((p) => p.shipmentId === 1)).toMatchObject({ out: false, x: 600 })
  })
})

describe('load plan arranged by hand: rules', () => {
  const texts = (pieces: EditPiece[]) => checkLoad(pieces, SPACE, ORDER, name).map((p) => p.text)

  it('has nothing to say about the computed plan', () => {
    const shipments = [1, 2, 3].map(
      (id) => ({ id, externalId: name(id), lengthMm: 1200, widthMm: 800, heightMm: 1500, ldmTenths: 5, weightKg: 100 }) as Shipment,
    )
    const plan = rearLoadedPlan(1, ROUTE, { innerLengthMm: 13600, innerWidthMm: 2480, innerHeightMm: 2700 }, shipments)
    expect(texts(piecesFromPlacements(plan.placements, new Map()))).toEqual([])
  })

  it('says what reaches out, overlaps or does not rest fully', () => {
    expect(texts([piece(1, 1300, 0, 0, 100, 100, 100)])).toEqual(['P1 izlazi iz tovarnog prostora.'])
    expect(texts([piece(1, 0, 200, 0, 100, 100, 100)])).toEqual(['P1 izlazi iz tovarnog prostora.'])
    expect(texts([piece(1, 0, 0, 0, 100, 100, 300)])).toEqual(['P1 izlazi iz tovarnog prostora.'])
    // 3 is unloaded together with 2, so only the overlap counts here.
    expect(texts([piece(2, 0, 0, 0, 100, 100, 100), piece(3, 50, 50, 0, 100, 100, 100)])).toEqual(['P2 i P3 se preklapaju.'])
    // Pieces of one shipment are as smartLoad+ placed them.
    expect(texts([piece(1, 0, 0, 0, 100, 100, 100, 1), piece(1, 50, 0, 0, 100, 100, 100, 2)])).toEqual([])
    // Half of 3 hangs in the air (2 and 3 come off together: no order rule).
    expect(texts([piece(2, 0, 0, 0, 100, 100, 100), piece(3, 50, 0, 100, 100, 100, 100)])).toEqual(['P3 nema pun oslonac (50 % osnove).'])
    // Fully on two pieces of 2: supported.
    expect(texts([piece(2, 0, 0, 0, 50, 100, 100, 1), piece(2, 50, 0, 0, 50, 100, 100, 2), piece(3, 0, 0, 100, 100, 100, 50)])).toEqual([])
  })

  it('warns as the computed plan, except where its row would end, and for every broken rule', () => {
    const computed = ['Raspored je duži od tovarnog prostora (14000 mm > 13600 mm).', 'Raspored pošiljke P1 iz smartLoad+ je širi…']
    const problems = checkLoad([piece(1, 1300, 0, 0, 100, 100, 100)], SPACE, ORDER, name)
    expect(arrangedWarnings(computed, problems)).toEqual([
      'Raspored pošiljke P1 iz smartLoad+ je širi…',
      'Ručno uređen raspored: P1 izlazi iz tovarnog prostora.',
    ])
  })

  it('wants what comes off earlier free towards the doors and with nothing on it', () => {
    // 2 comes off after 1 and stands on it.
    expect(texts([piece(1, 1000, 0, 0, 100, 100, 100), piece(2, 1000, 0, 100, 100, 100, 100)])).toEqual([
      'P1 (istovar 1.) ne može da izađe: na njoj je P2 (istovar 2.).',
    ])
    // 3 stands between 1 and the doors, in its way.
    expect(texts([piece(1, 1000, 0, 0, 100, 100, 100), piece(3, 1200, 50, 0, 100, 100, 100)])).toEqual([
      'P1 (istovar 1.) ne može da izađe: ispred nje, ka vratima, je P3 (istovar 3.).',
    ])
    // Beside its way, behind it (towards the front wall), or above its height: fine.
    expect(texts([piece(1, 1000, 0, 0, 100, 100, 100), piece(3, 1200, 120, 0, 100, 100, 100)])).toEqual([])
    expect(texts([piece(1, 1000, 0, 0, 100, 100, 100), piece(3, 800, 0, 0, 100, 100, 100)])).toEqual([])
    // 1 on top of 2 (1 comes off first): fine; 2 and 3 in each other's way: they come off together.
    expect(texts([piece(2, 0, 0, 0, 100, 100, 100), piece(1, 0, 0, 100, 100, 100, 100)])).toEqual([])
    expect(texts([piece(2, 0, 0, 0, 100, 100, 100), piece(3, 100, 0, 0, 100, 100, 100)])).toEqual([])
  })
})
