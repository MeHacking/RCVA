import { ApiError } from '../client'
import type { LoadPlan, OptimizationResult, Placement, Shipment, Truck } from '../types'

/**
 * Stand-in for the backend's SimpleLoadPlanner (Spec v2, section 7): one row of blocks
 * along the cargo length, in pickup order. Not a packing algorithm.
 * - ILLUSTRATIVE_LDM (some shipment has no dimensions): full-width blocks whose length
 *   follows LDM (1 LDM = 1000 mm of a full-width trailer).
 * - DIMENSIONAL (all shipments have dimensions): the real boxes, side by side.
 */
export function buildLoadPlan(jobId: number, result: OptimizationResult, truck: Truck, shipments: Shipment[]): LoadPlan {
  const route = result.routes.find((r) => r.truckId === truck.id)
  if (!route) {
    throw new ApiError({ title: 'Ne postoji', status: 404, detail: `Kamion ${truck.id} nema rutu u poslu ${jobId}.` })
  }
  const { innerLengthMm, innerWidthMm, innerHeightMm } = truck
  if (innerLengthMm === null || innerWidthMm === null || innerHeightMm === null) {
    throw new ApiError({
      title: 'Nedostaju dimenzije kamiona',
      status: 409,
      detail: `Kamion „${truck.name}“ nema unete dimenzije tovarnog prostora; 3D raspored nije moguć.`,
    })
  }

  const byId = new Map(shipments.map((s) => [s.id, s]))
  const loaded = route.stops
    .filter((stop) => stop.type === 'PICKUP')
    .map((stop) => byId.get(stop.shipmentId))
    .filter((s): s is Shipment => s !== undefined)
  const dimensional = loaded.every((s) => s.lengthMm !== null && s.widthMm !== null && s.heightMm !== null)

  const placements: Placement[] = []
  const warnings: string[] = []
  let x = 0
  for (const shipment of loaded) {
    const lengthMm = dimensional ? (shipment.lengthMm as number) : shipment.ldmTenths * 100
    const widthMm = dimensional ? (shipment.widthMm as number) : innerWidthMm
    const heightMm = Math.min(shipment.heightMm ?? innerHeightMm, innerHeightMm)
    placements.push({ shipmentId: shipment.id, xMm: x, yMm: 0, zMm: 0, lengthMm, widthMm, heightMm, rotated: false })
    if (widthMm > innerWidthMm) warnings.push(`Pošiljka ${shipment.externalId} je šira od tovarnog prostora.`)
    x += lengthMm
  }
  if (x > innerLengthMm) {
    warnings.push(`Raspored je duži od tovarnog prostora (${x} mm > ${innerLengthMm} mm).`)
  }

  return { jobId, truckId: truck.id, mode: dimensional ? 'DIMENSIONAL' : 'ILLUSTRATIVE_LDM', placements, warnings }
}
