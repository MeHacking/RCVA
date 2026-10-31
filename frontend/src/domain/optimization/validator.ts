import type { OptimizationResult, RouteStop, ValidationReport } from '../../api/types'
import { formatKg, formatLdm } from '../../format/units'
import { weightOf, type JobInput } from './job'

// Port of backend/.../optimization/SolutionValidator.java with the process owner's model:
// start and end of a route from job.rules (open route: no leg before the first stop and
// none after the last), weight against the truck's payload, and rear loading.
// Independent of the solver and of RoutePlanner: it recomputes loads and distances from
// the stops alone, so a bug in either shows up here as a violation. Messages are shown to
// users.

export function validate(job: JobInput, result: OptimizationResult): ValidationReport {
  const violations: string[] = []
  const shipments = new Map(job.shipments.map((s) => [s.id, s]))
  const trucks = new Map(job.trucks.map((t) => [t.id, t]))
  const locations = new Map(job.locationIds.map((id, i) => [id, i]))

  const pickedUp = new Map<number, number>()
  const delivered = new Map<number, number>()
  const usedTrucks = new Set<number>()
  let totalMeters = 0
  let trucksUsed = 0

  for (const route of result.routes) {
    const truck = trucks.get(route.truckId)
    const name = truck?.name ?? `Kamion #${route.truckId}`
    if (!truck) violations.push(`${name} nije među kamionima ovog posla.`)
    if (usedTrucks.has(route.truckId)) violations.push(`${name} ima više od jedne rute.`)
    usedTrucks.add(route.truckId)
    if (route.stops.length > 0) trucksUsed++

    const onBoard = new Set<number>()
    let deliveringStarted = false
    let load = 0
    let maxLoad = 0
    let weight = 0
    let maxWeight = 0
    let meters = 0
    let previous = job.rules.start
    route.stops.forEach((stop, i) => {
      const where = `${name}, stanica ${i + 1}`
      if (stop.sequence !== i + 1) violations.push(`${where}: redni broj je ${stop.sequence}.`)
      const shipment = shipments.get(stop.shipmentId)
      if (!shipment) {
        violations.push(`${where}: pošiljka #${stop.shipmentId} nije u ovom poslu.`)
        return
      }
      const label = shipment.externalId
      const pickup = stop.type === 'PICKUP'
      const expectedLocation = pickup ? shipment.pickupLocationId : shipment.deliveryLocationId
      if (stop.locationId !== expectedLocation) {
        violations.push(
          `${where}: ${label} se ${pickup ? 'preuzima' : 'isporučuje'} na lokaciji #${expectedLocation}, ne #${stop.locationId}.`,
        )
      }
      if (pickup) {
        increment(pickedUp, shipment.id)
        onBoard.add(shipment.id)
        load += shipment.ldmTenths
        weight += weightOf(shipment)
        if (deliveringStarted) violations.push(`${where}: preuzimanje ${label} posle prve isporuke (ruta ima dve faze).`)
      } else {
        increment(delivered, shipment.id)
        if (!onBoard.delete(shipment.id)) {
          violations.push(`${where}: ${label} se isporučuje pre preuzimanja ili drugim kamionom.`)
        }
        load -= shipment.ldmTenths
        weight -= weightOf(shipment)
        deliveringStarted = true
      }
      maxLoad = Math.max(maxLoad, load)
      maxWeight = Math.max(maxWeight, weight)
      if (stop.loadAfterLdmTenths !== load) {
        violations.push(`${where}: teret posle stanice je ${formatLdm(load)} LDM, ne ${formatLdm(stop.loadAfterLdmTenths)}.`)
      }
      const at = locations.get(expectedLocation)
      if (at === undefined) {
        violations.push(`${where}: lokacija #${expectedLocation} nema rastojanja u ovom poslu.`)
        return
      }
      const leg = previous === null ? 0 : job.distance[previous][at]
      if (stop.legMeters !== leg) violations.push(`${where}: deonica je ${leg} m, ne ${stop.legMeters} m.`)
      meters += leg
      previous = at
    })

    if (onBoard.size > 0) violations.push(`${name}: pošiljke preuzete a neisporučene: ${onBoard.size}.`)
    if (truck && maxLoad > truck.capacityLdmTenths) {
      violations.push(`${name}: teret ${formatLdm(maxLoad)} LDM je veći od kapaciteta ${formatLdm(truck.capacityLdmTenths)} LDM.`)
    }
    if (truck && maxWeight > truck.capacityKg) {
      violations.push(`${name}: teret ${formatKg(maxWeight)} kg je veći od nosivosti ${formatKg(truck.capacityKg)} kg.`)
    }
    if (route.usedLdmTenths !== maxLoad) {
      violations.push(`${name}: najveći teret je ${formatLdm(maxLoad)} LDM, ne ${formatLdm(route.usedLdmTenths)}.`)
    }
    if (job.rules.lifo) violations.push(...rearLoadingViolations(name, route.stops, shipments))
    if (job.rules.end !== null && previous !== null && route.stops.length > 0) meters += job.distance[previous][job.rules.end]
    if (route.totalMeters !== meters) violations.push(`${name}: dužina rute je ${meters} m, ne ${route.totalMeters} m.`)
    totalMeters += meters
  }

  const unassigned = new Set(result.unassignedShipmentIds)
  for (const shipment of job.shipments) {
    const p = pickedUp.get(shipment.id) ?? 0
    const d = delivered.get(shipment.id) ?? 0
    const listedUnassigned = unassigned.has(shipment.id)
    if (listedUnassigned ? p + d > 0 : p !== 1 || d !== 1) {
      violations.push(
        `Pošiljka ${shipment.externalId} je preuzeta ${p} i isporučena ${d} put(a)` +
          (listedUnassigned ? ', a navedena je kao nedodeljena.' : '; očekuje se po jednom.'),
      )
    }
  }
  if (result.trucksUsed !== trucksUsed) violations.push(`Broj korišćenih kamiona je ${trucksUsed}, ne ${result.trucksUsed}.`)
  if (result.totalMeters !== totalMeters) violations.push(`Ukupna dužina je ${totalMeters} m, ne ${result.totalMeters} m.`)
  return { passed: violations.length === 0, violations }
}

/**
 * Loaded from the rear only (D2): what is unloaded first must be loaded last. Checked pair
 * by pair over places, where a place is a run of consecutive stops of one type at one
 * location: a shipment loaded at an earlier place than another may not be unloaded at an
 * earlier place. Shipments loaded or unloaded at the same place may be in any order.
 */
function rearLoadingViolations(name: string, stops: RouteStop[], shipments: Map<number, { externalId: string }>): string[] {
  const loadedAt = new Map<number, number>()
  const unloadedAt = new Map<number, number>()
  let place = 0
  stops.forEach((stop, i) => {
    const before = stops[i - 1]
    if (before && (before.type !== stop.type || before.locationId !== stop.locationId)) place++
    ;(stop.type === 'PICKUP' ? loadedAt : unloadedAt).set(stop.shipmentId, place)
  })
  const both = [...loadedAt.keys()].filter((id) => unloadedAt.has(id) && shipments.has(id))
  const violations: string[] = []
  for (const a of both) {
    for (const b of both) {
      if (loadedAt.get(a)! < loadedAt.get(b)! && unloadedAt.get(a)! < unloadedAt.get(b)!) {
        violations.push(
          `${name}: ${shipments.get(a)!.externalId} je utovarena pre ${shipments.get(b)!.externalId}, a istovara se pre nje; kamion se tovari samo pozadi.`,
        )
      }
    }
  }
  return violations
}

function increment(counts: Map<number, number>, id: number): void {
  counts.set(id, (counts.get(id) ?? 0) + 1)
}
