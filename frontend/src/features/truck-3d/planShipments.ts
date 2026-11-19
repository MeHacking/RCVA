import type { Placement } from '../../api/types'
import { placementColor } from './placementColor'

// A load plan by shipment. A shipment is one placement (a block), or one per piece when it
// has a layout from smartLoad+; the 3D view, the list beside it and the PDF show shipments.

export interface PlanShipment {
  shipmentId: number
  /** its colour everywhere: its place among the plan's shipments */
  color: string
  /** 1 for a block */
  pieces: number
  /** the room its pieces take, in mm (for a block, the block) */
  xMm: number
  yMm: number
  zMm: number
  lengthMm: number
  widthMm: number
  heightMm: number
}

/** The plan's shipments in the order they first appear in its placements. */
export function planShipments(placements: Placement[]): PlanShipment[] {
  const byId = new Map<number, Placement[]>()
  for (const p of placements) {
    const pieces = byId.get(p.shipmentId)
    if (pieces) pieces.push(p)
    else byId.set(p.shipmentId, [p])
  }
  return [...byId].map(([shipmentId, pieces], index) => {
    const low = (at: (p: Placement) => number) => Math.min(...pieces.map(at))
    const high = (at: (p: Placement) => number) => Math.max(...pieces.map(at))
    const [x, y, z] = [low((p) => p.xMm), low((p) => p.yMm), low((p) => p.zMm)]
    return {
      shipmentId,
      color: placementColor(index),
      pieces: pieces.length,
      xMm: x,
      yMm: y,
      zMm: z,
      lengthMm: high((p) => p.xMm + p.lengthMm) - x,
      widthMm: high((p) => p.yMm + p.widthMm) - y,
      heightMm: high((p) => p.zMm + p.heightMm) - z,
    }
  })
}

/** Each shipment's colour, by id. */
export function shipmentColors(placements: Placement[]): Map<number, string> {
  return new Map(planShipments(placements).map((s) => [s.shipmentId, s.color]))
}
