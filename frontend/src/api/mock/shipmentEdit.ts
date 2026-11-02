import { ApiError } from '../client'
import type { Location, PlaceGuess, PlaceInput, PlaceLookup, Shipment, ShipmentPatch, ShipmentUpdateResult } from '../types'
import { findPlace, type LocateResult, type PlaceLocator } from './import/importStore'

type Role = PlaceLookup['role']

const ROLES: readonly Role[] = ['pickup', 'delivery']
const LOCATION_ID = { pickup: 'pickupLocationId', delivery: 'deliveryLocationId' } as const
const MISSING_PLACE: Record<Role, string> = { pickup: 'Unesite mesto preuzimanja.', delivery: 'Unesite mesto isporuke.' }

/** What one place of the edited shipment becomes; decided before anything is changed. */
interface PlacePlan {
  role: Role
  place: PlaceGuess
  /** the place was given in the patch (not only looked up again) */
  given: boolean
  outcome: PlaceLookup['outcome']
  coordinates: { lat: number; lon: number } | null
  message: string | null
}

/**
 * Corrections of imported shipments, for the mock and the application on the device. A
 * place keeps its name and coordinates once it has them (kept results name it); a new name
 * is another place, found among the known ones or created. Places without coordinates get
 * them from the lookup (asked only for the places of this shipment) or by hand. Nothing
 * changes when the patch has an error, and the lookup is asked only after the checks.
 */
export function createShipmentEditor(deps: {
  shipments: Shipment[]
  locations: Location[]
  locate: PlaceLocator
  /** throws (409) when shipments may not change now; called before the lookup and before the change */
  assertCanChange?: () => void
  /** a place no shipment uses any more is removed unless this keeps it (kept results, the base) */
  keepsPlace?: (locationId: number) => boolean
}) {
  const { shipments, locations, locate, assertCanChange = () => {}, keepsPlace = () => true } = deps

  function find(id: number): Shipment {
    const shipment = shipments.find((s) => s.id === id)
    if (!shipment) throw new ApiError({ title: 'Ne postoji', status: 404, detail: `Pošiljka ${id} ne postoji.` })
    return shipment
  }

  /** field -> message for everything the patch gets wrong */
  function check(shipment: Shipment, patch: ShipmentPatch): Record<string, string> {
    const errors: Record<string, string> = {}
    if (patch.externalId !== undefined) {
      const externalId = patch.externalId.trim()
      if (!externalId) errors.externalId = 'Unesite ID pošiljke.'
      else if (shipments.some((s) => s.id !== shipment.id && s.externalId === externalId)) {
        errors.externalId = `ID „${externalId}“ već postoji među pošiljkama.`
      }
    }
    if (patch.ldmTenths !== undefined && (!Number.isInteger(patch.ldmTenths) || patch.ldmTenths <= 0)) {
      errors.ldmTenths = 'LDM mora biti veći od 0, sa najviše jednom decimalom.'
    }
    if (patch.weightKg !== undefined && patch.weightKg !== null && !(Number.isFinite(patch.weightKg) && patch.weightKg > 0)) {
      errors.weightKg = 'Težina mora biti veća od 0 ili prazna.'
    }
    for (const role of ROLES) {
      const input = patch[role]
      if (!input) continue
      const place = cleanPlace(input)
      if (!place.name) {
        errors[role] = MISSING_PLACE[role]
        continue
      }
      const coordinates = input.coordinates
      if (!coordinates) continue
      const { lat, lon } = coordinates
      if (!(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
        errors[`${role}Coordinates`] = 'Geografska širina mora biti između -90 i 90, a dužina između -180 i 180.'
        continue
      }
      const known = findPlace(locations, place)
      if (known && hasCoordinates(known) && (known.lat !== lat || known.lon !== lon)) {
        errors[`${role}Coordinates`] = `Mesto „${known.name}“ već ima koordinate; ručno se unose samo za mesto bez njih.`
      }
    }
    return errors
  }

  /** Each place of the shipment after the patch, with its coordinates; asks the lookup where needed. */
  async function plan(shipment: Shipment, patch: ShipmentPatch): Promise<PlacePlan[]> {
    const asked = new Map<string, LocateResult>()
    const plans: PlacePlan[] = []
    for (const role of ROLES) {
      const input = patch[role]
      const current = locations.find((l) => l.id === shipment[LOCATION_ID[role]])
      const place = input ? cleanPlace(input) : current ? asPlace(current) : null
      // A shipment always has its places; one without them cannot be looked up again.
      if (!place) continue
      const known = findPlace(locations, place)
      const base = { role, place, given: !!input, message: null }
      if (known && hasCoordinates(known)) {
        plans.push({ ...base, outcome: 'known', coordinates: { lat: known.lat, lon: known.lon } })
      } else if (input?.coordinates) {
        plans.push({ ...base, outcome: 'manual', coordinates: input.coordinates })
      } else {
        const id = `${place.name.toLowerCase()}|${place.country ?? ''}`
        let result = asked.get(id)
        if (!result) {
          result = await locate(place)
          asked.set(id, result)
        }
        plans.push(
          result.kind === 'found'
            ? { ...base, outcome: 'found', coordinates: { lat: result.lat, lon: result.lon } }
            : { ...base, outcome: result.kind, coordinates: null, message: result.kind === 'failed' ? result.message : null },
        )
      }
    }
    return plans
  }

  /** The location of a planned place: a known one (given coordinates if it has none) or a new one. */
  function placeFor(plan: PlacePlan): Location {
    const status = plan.outcome === 'manual' || (plan.outcome === 'found' && plan.given) ? 'MANUAL' : 'OK'
    const known = findPlace(locations, plan.place)
    if (known) {
      // Without coordinates the place is in no result, so it may still change.
      if (!hasCoordinates(known)) {
        if (plan.given) known.country = plan.place.country
        if (plan.coordinates) Object.assign(known, plan.coordinates, { geocodeStatus: status })
      }
      return known
    }
    const created: Location = {
      id: Math.max(0, ...locations.map((l) => l.id)) + 1,
      name: plan.place.name,
      address: null,
      country: plan.place.country,
      postalCode: plan.place.postalCode,
      lat: plan.coordinates?.lat ?? null,
      lon: plan.coordinates?.lon ?? null,
      geocodeStatus: plan.coordinates ? status : 'FAILED',
    }
    locations.push(created)
    return created
  }

  function dropUnusedPlaces(): void {
    const used = new Set(shipments.flatMap((s) => [s.pickupLocationId, s.deliveryLocationId]))
    const kept = locations.filter((l) => used.has(l.id) || keepsPlace(l.id))
    locations.splice(0, locations.length, ...kept)
  }

  return {
    async update(id: number, patch: ShipmentPatch): Promise<ShipmentUpdateResult> {
      assertCanChange()
      const errors = check(find(id), patch)
      if (Object.keys(errors).length > 0) throw new ApiError({ title: 'Neispravna pošiljka', status: 400, errors })
      const plans = await plan(find(id), patch)

      // The lookup took time: check again against the data as it is now.
      assertCanChange()
      const shipment = find(id)
      const again = check(shipment, patch)
      if (Object.keys(again).length > 0) throw new ApiError({ title: 'Neispravna pošiljka', status: 400, errors: again })

      if (patch.externalId !== undefined) shipment.externalId = patch.externalId.trim()
      if (patch.ldmTenths !== undefined) shipment.ldmTenths = patch.ldmTenths
      if (patch.weightKg !== undefined) shipment.weightKg = patch.weightKg
      if (patch.description !== undefined) shipment.description = patch.description?.trim() || null
      const moved = new Set<number>()
      for (const plan of plans) {
        const field = LOCATION_ID[plan.role]
        const before = locations.find((l) => l.id === shipment[field])
        const after = placeFor(plan)
        shipment[field] = after.id
        if (!patch[plan.role]?.moveOtherShipments || !before || before.id === after.id || hasCoordinates(before)) continue
        for (const other of shipments) {
          if (other.id === shipment.id) continue
          for (const otherField of Object.values(LOCATION_ID)) {
            if (other[otherField] !== before.id) continue
            other[otherField] = after.id
            moved.add(other.id)
          }
        }
      }
      dropUnusedPlaces()
      return {
        shipment,
        movedShipments: moved.size,
        places: plans.map((p) => ({ role: p.role, name: p.place.name, outcome: p.outcome, message: p.message })),
      }
    },
  }
}

function cleanPlace(place: PlaceInput): PlaceGuess {
  return {
    name: place.name.trim(),
    postalCode: place.postalCode?.trim() || null,
    country: place.country?.trim().toUpperCase() || null,
  }
}

function asPlace(location: Location): PlaceGuess {
  return { name: location.name, postalCode: location.postalCode, country: location.country }
}

function hasCoordinates(location: Location): location is Location & { lat: number; lon: number } {
  return location.lat !== null && location.lon !== null
}
