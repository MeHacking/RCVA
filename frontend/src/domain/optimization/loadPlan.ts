import type { LoadPlan, Placement, RoutePlan, Shipment } from '../../api/types'

// Load plan for the 3D view (Spec v2, section 7), as src/api/mock/loadPlan.ts and
// backend/.../optimization/SimpleLoadPlanner.java, but loaded from the rear (D2): one row
// of blocks from the front wall (x = 0) to the doors (x = inner length), in reverse
// unloading order, so what is unloaded first stands at the doors. Not a packing
// algorithm.
// - ILLUSTRATIVE_LDM (some shipment has no dimensions): full-width blocks whose length
//   follows LDM (1 LDM = 1000 mm of a full-width trailer).
// - DIMENSIONAL (all shipments have dimensions): the real boxes, one behind the other.

export interface CargoSpace {
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
}

export function rearLoadedPlan(jobId: number, route: RoutePlan, space: CargoSpace, shipments: Shipment[]): LoadPlan {
  const byId = new Map(shipments.map((s) => [s.id, s]))
  const fromFront = route.stops
    .filter((stop) => stop.type === 'DELIVERY')
    .reverse()
    .map((stop) => byId.get(stop.shipmentId))
    .filter((s): s is Shipment => s !== undefined)
  const dimensional = fromFront.every((s) => s.lengthMm !== null && s.widthMm !== null && s.heightMm !== null)

  const placements: Placement[] = []
  const warnings: string[] = []
  let x = 0
  for (const shipment of fromFront) {
    const lengthMm = dimensional ? (shipment.lengthMm as number) : shipment.ldmTenths * 100
    const widthMm = dimensional ? (shipment.widthMm as number) : space.innerWidthMm
    const heightMm = Math.min(shipment.heightMm ?? space.innerHeightMm, space.innerHeightMm)
    placements.push({ shipmentId: shipment.id, xMm: x, yMm: 0, zMm: 0, lengthMm, widthMm, heightMm, rotated: false })
    if (widthMm > space.innerWidthMm) warnings.push(`Pošiljka ${shipment.externalId} je šira od tovarnog prostora.`)
    x += lengthMm
  }
  if (x > space.innerLengthMm) {
    warnings.push(`Raspored je duži od tovarnog prostora (${x} mm > ${space.innerLengthMm} mm).`)
  }
  return { jobId, truckId: route.truckId, mode: dimensional ? 'DIMENSIONAL' : 'ILLUSTRATIVE_LDM', placements, warnings }
}
