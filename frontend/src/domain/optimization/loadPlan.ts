import type { LoadPlan, Placement, RoutePlan, Shipment, ShipmentLayout } from '../../api/types'
import { formatLdm } from '../../format/units'
import { layoutLdmTenths } from '../smartLoadLayout'

// Load plan for the 3D view (Spec v2, section 7), as src/api/mock/loadPlan.ts and
// backend/.../optimization/SimpleLoadPlanner.java, but loaded from the rear (D2): one row
// of blocks from the front wall (x = 0) to the doors (x = inner length), in reverse
// unloading order, so what is unloaded first stands at the doors. Not a packing
// algorithm.
// - ILLUSTRATIVE_LDM (some shipment has no dimensions): full-width blocks whose length
//   follows LDM (1 LDM = 1000 mm of a full-width trailer).
// - DIMENSIONAL (all shipments have dimensions): the real boxes, one behind the other.
// A shipment with a layout from smartLoad+ (smartLoadLayout.ts) is its pieces instead of a
// block, where the block would start, and takes the layout's occupied length; it counts as
// having dimensions.

export interface CargoSpace {
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
}

/** The start of the warning for a row longer than the cargo space (a plan arranged by hand drops it). */
export const LONGER_THAN_SPACE = 'Raspored je duži od tovarnog prostora'

export function rearLoadedPlan(
  jobId: number,
  route: RoutePlan,
  space: CargoSpace,
  shipments: Shipment[],
  layouts: ReadonlyMap<number, ShipmentLayout> = new Map(),
): LoadPlan {
  const byId = new Map(shipments.map((s) => [s.id, s]))
  const fromFront = route.stops
    .filter((stop) => stop.type === 'DELIVERY')
    .reverse()
    .map((stop) => byId.get(stop.shipmentId))
    .filter((s): s is Shipment => s !== undefined)
  const dimensional = fromFront.every(
    (s) => layouts.has(s.id) || (s.lengthMm !== null && s.widthMm !== null && s.heightMm !== null),
  )

  const placements: Placement[] = []
  const warnings: string[] = []
  const used: NonNullable<LoadPlan['layouts']> = []
  let x = 0
  for (const shipment of fromFront) {
    const layout = layouts.get(shipment.id)
    if (layout) {
      layout.pieces.forEach((p, i) =>
        placements.push({
          shipmentId: shipment.id,
          xMm: x + p.xMm,
          yMm: p.yMm,
          zMm: p.zMm,
          lengthMm: p.lengthMm,
          widthMm: p.widthMm,
          heightMm: p.heightMm,
          rotated: p.rotated,
          piece: i + 1,
        }),
      )
      warnings.push(...layoutWarnings(shipment, layout, space))
      used.push({ shipmentId: shipment.id, name: layout.name, pieces: layout.pieces.length })
      x += layout.lengthMm
      continue
    }
    const lengthMm = dimensional ? (shipment.lengthMm as number) : shipment.ldmTenths * 100
    const widthMm = dimensional ? (shipment.widthMm as number) : space.innerWidthMm
    const heightMm = Math.min(shipment.heightMm ?? space.innerHeightMm, space.innerHeightMm)
    placements.push({ shipmentId: shipment.id, xMm: x, yMm: 0, zMm: 0, lengthMm, widthMm, heightMm, rotated: false })
    if (widthMm > space.innerWidthMm) warnings.push(`Pošiljka ${shipment.externalId} je šira od tovarnog prostora.`)
    x += lengthMm
  }
  if (x > space.innerLengthMm) {
    warnings.push(`${LONGER_THAN_SPACE} (${x} mm > ${space.innerLengthMm} mm).`)
  }
  return {
    jobId,
    truckId: route.truckId,
    mode: dimensional ? 'DIMENSIONAL' : 'ILLUSTRATIVE_LDM',
    placements,
    warnings,
    ...(used.length > 0 ? { layouts: used } : {}),
  }
}

function layoutWarnings(shipment: Shipment, layout: ShipmentLayout, space: CargoSpace): string[] {
  const of = `Raspored pošiljke ${shipment.externalId} iz smartLoad+`
  const warnings: string[] = []
  if (layout.widthMm > space.innerWidthMm) {
    warnings.push(`${of} je širi od tovarnog prostora (${layout.widthMm} mm > ${space.innerWidthMm} mm).`)
  }
  if (layout.heightMm > space.innerHeightMm) {
    warnings.push(`${of} je viši od tovarnog prostora (${layout.heightMm} mm > ${space.innerHeightMm} mm).`)
  }
  if (layout.unplacedPieces > 0) warnings.push(`${of} nema sve komade: u smartLoad+ nije stalo ${layout.unplacedPieces}.`)
  // The job keeps the shipment as it was then: a layout imported later (or an LDM changed by hand) is not in its routes.
  const ldm = layoutLdmTenths(layout)
  if (ldm !== shipment.ldmTenths) {
    warnings.push(
      `Pošiljka ${shipment.externalId} je u ovom rezultatu računata sa ${formatLdm(shipment.ldmTenths)} LDM, ` +
        `a po rasporedu iz smartLoad+ zauzima ${formatLdm(ldm)} LDM; pokrenite optimizaciju ponovo.`,
    )
  }
  return warnings
}
