import type { Location, PlaceInput, Shipment, ShipmentPatch, ShipmentUpdateResult } from '../../api/types'
import { parseCoordinates } from '../../format/coordinates'
import { formatKg, formatLdm, parseKg, parseLdmTenths } from '../../format/units'

export type PlaceRole = 'pickup' | 'delivery'

export interface PlaceFormValues {
  name: string
  postalCode: string
  country: string
  /** "latitude, longitude" entered by hand; empty = not given */
  coordinates: string
  /** move the other shipments at the old place too (offered only for a place without coordinates) */
  moveOthers: boolean
}

export interface ShipmentFormValues {
  externalId: string
  ldm: string
  weight: string
  description: string
  pickup: PlaceFormValues
  delivery: PlaceFormValues
}

export type ShipmentFormField =
  | 'externalId'
  | 'ldm'
  | 'weight'
  | 'pickup'
  | 'delivery'
  | 'pickupCoordinates'
  | 'deliveryCoordinates'

export type ShipmentFormErrors = Partial<Record<ShipmentFormField, string>>

export function toFormValues(shipment: Shipment, locations: Location[]): ShipmentFormValues {
  const place = (id: number): PlaceFormValues => {
    const location = locations.find((l) => l.id === id)
    return {
      name: location?.name ?? '',
      postalCode: location?.postalCode ?? '',
      country: location?.country ?? '',
      coordinates: '',
      moveOthers: true,
    }
  }
  return {
    externalId: shipment.externalId,
    ldm: formatLdm(shipment.ldmTenths),
    weight: shipment.weightKg === null ? '' : formatKg(shipment.weightKg),
    description: shipment.description ?? '',
    pickup: place(shipment.pickupLocationId),
    delivery: place(shipment.deliveryLocationId),
  }
}

/** The name or the postal code differs: the shipment gets another place, not the same one corrected. */
export function placeReplaced(values: PlaceFormValues, initial: PlaceFormValues): boolean {
  return values.name.trim() !== initial.name || values.postalCode.trim() !== initial.postalCode
}

/** Other shipments that use the place as pickup or delivery. */
export function otherShipmentsAt(locationId: number, shipments: Shipment[], exceptId: number): number {
  return shipments.filter((s) => s.id !== exceptId && (s.pickupLocationId === locationId || s.deliveryLocationId === locationId)).length
}

/**
 * The patch with only what changed, or the errors of the form. A place is sent when it
 * changed or coordinates were entered; an unchanged form is an empty patch, which still
 * looks up the shipment's places without coordinates again.
 */
export function buildShipmentPatch(
  values: ShipmentFormValues,
  initial: ShipmentFormValues,
): { ok: true; patch: ShipmentPatch } | { ok: false; errors: ShipmentFormErrors } {
  const errors: ShipmentFormErrors = {}
  const patch: ShipmentPatch = {}

  const externalId = values.externalId.trim()
  if (!externalId) errors.externalId = 'Unesite ID pošiljke.'
  else if (externalId !== initial.externalId) patch.externalId = externalId

  if (values.ldm.trim() !== initial.ldm) {
    const ldmTenths = parseLdmTenths(values.ldm)
    if (ldmTenths === null || ldmTenths <= 0) errors.ldm = 'Unesite LDM veći od 0, sa najviše jednom decimalom (npr. 2,4).'
    else patch.ldmTenths = ldmTenths
  }

  if (values.weight.trim() !== initial.weight) {
    const weightKg = parseKg(values.weight)
    if (weightKg === 'invalid') errors.weight = 'Unesite težinu u celim kilogramima ili ostavite polje prazno.'
    else patch.weightKg = weightKg
  }

  if (values.description.trim() !== initial.description) patch.description = values.description.trim() || null

  for (const role of ['pickup', 'delivery'] as const) {
    const place = values[role]
    const start = initial[role]
    if (!place.name.trim()) {
      errors[role] = role === 'pickup' ? 'Unesite mesto preuzimanja.' : 'Unesite mesto isporuke.'
      continue
    }
    const coordinates = parseCoordinates(place.coordinates)
    if (coordinates === 'invalid') {
      errors[`${role}Coordinates`] = 'Unesite širinu i dužinu, npr. 45.2671, 19.8335.'
      continue
    }
    const changed = placeReplaced(place, start) || place.country.trim().toUpperCase() !== start.country.toUpperCase()
    if (!changed && !coordinates) continue
    const input: PlaceInput = {
      name: place.name.trim(),
      postalCode: place.postalCode.trim() || null,
      country: place.country.trim().toUpperCase() || null,
    }
    if (coordinates) input.coordinates = coordinates
    if (placeReplaced(place, start) && place.moveOthers) input.moveOtherShipments = true
    patch[role] = input
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, patch }
}

/** The API's field errors (400) on the form's fields. */
export function apiErrorsToForm(errors: Record<string, string>): ShipmentFormErrors {
  const fields: Record<string, ShipmentFormField> = {
    externalId: 'externalId',
    ldmTenths: 'ldm',
    weightKg: 'weight',
    pickup: 'pickup',
    delivery: 'delivery',
    pickupCoordinates: 'pickupCoordinates',
    deliveryCoordinates: 'deliveryCoordinates',
  }
  const result: ShipmentFormErrors = {}
  for (const [key, message] of Object.entries(errors)) {
    const field = fields[key]
    if (field) result[field] = message
  }
  return result
}

/** The message after a saved correction: what happened to the places, and to other shipments. */
export function describeUpdate(result: ShipmentUpdateResult): { tone: 'success' | 'warning'; title: string; lines: string[] } {
  const lines: string[] = []
  for (const place of result.places) {
    const name = `„${place.name}“`
    const line = {
      known: null,
      found: `${name}: koordinate su pronađene.`,
      manual: `${name}: koordinate su unete ručno.`,
      notFound: `${name} nije pronađeno, pa lokacija ostaje nejasna. Upišite drugi naziv (npr. obližnje mesto) ili koordinate.`,
      failed: `Koordinate za ${name} nisu tražene: ${place.message ?? 'nepoznata greška.'} Sačuvajte ponovo kasnije.`,
    }[place.outcome]
    if (line && !lines.includes(line)) lines.push(line)
  }
  if (result.movedShipments > 0) lines.push(`Ispravljeno je i ostalih pošiljki sa istim mestom: ${result.movedShipments}.`)
  const unclear = result.places.some((p) => p.outcome === 'notFound' || p.outcome === 'failed')
  return {
    tone: unclear ? 'warning' : 'success',
    title: `Pošiljka „${result.shipment.externalId}“ je sačuvana.`,
    lines,
  }
}
