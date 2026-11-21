import type { Truck, TruckStart } from '../../api/types'

/**
 * Where the trucks are, for the map on the Kamioni screen (user, 21.11.2026: "a map with pins
 * where each truck is"). One pin per place: trucks at the same place share it. A truck's
 * confirmed location is a full pin; the last delivery proposed after a job, until the user
 * answers it, a pin of its own kind.
 */
export interface TruckPin {
  kind: 'location' | 'proposal'
  locationId: number
  placeName: string
  /** [lat, lon] */
  at: [number, number]
  trucks: Array<{ id: number; name: string; available: boolean }>
}

export interface TruckMapModel {
  pins: TruckPin[]
  /** trucks without a confirmed location that has coordinates, by name */
  nowhere: string[]
}

/** What a pin says to a screen reader (and to tests): the place and its trucks. */
export function pinLabel(pin: TruckPin): string {
  const names = pin.trucks.map((t) => (t.available ? t.name : `${t.name} (nije dostupan)`)).join(', ')
  return pin.kind === 'proposal' ? `${pin.placeName}, predlog posle optimizacije: ${names}` : `${pin.placeName}: ${names}`
}

export function truckMapModel(trucks: Truck[], starts: TruckStart[]): TruckMapModel {
  const byTruck = new Map(starts.map((s) => [s.truckId, s]))
  const pins = new Map<string, TruckPin>()
  const nowhere: string[] = []
  const pinAt = (kind: TruckPin['kind'], location: TruckStart['location'], truck: Truck) => {
    if (!location || location.lat === null || location.lon === null) return false
    const key = `${kind}:${location.id}`
    let pin = pins.get(key)
    if (!pin) {
      pin = { kind, locationId: location.id, placeName: location.name, at: [location.lat, location.lon], trucks: [] }
      pins.set(key, pin)
    }
    pin.trucks.push({ id: truck.id, name: truck.name, available: truck.available })
    return true
  }
  for (const truck of trucks) {
    const start = byTruck.get(truck.id)
    if (!pinAt('location', start?.location ?? null, truck)) nowhere.push(truck.name)
    if (start?.proposal) pinAt('proposal', start.proposal.location, truck)
  }
  // Locations first, so a proposal at the same place is drawn above it.
  const ordered = [...pins.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'location' ? -1 : 1))
  return { pins: ordered, nowhere }
}
