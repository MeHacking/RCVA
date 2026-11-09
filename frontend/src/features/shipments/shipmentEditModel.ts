import type { Location, PlaceInput, Shipment, ShipmentInput, ShipmentPatch, ShipmentUpdateResult } from '../../api/types'
import { parseCoordinates } from '../../format/coordinates'
import { formatKg, formatLdm, parseKg, parseLdmTenths } from '../../format/units'

export type PlaceRole = 'pickup' | 'delivery'

export interface PlaceFormValues {
  name: string
  /**
   * The number read next to the place, kept as it is but never shown or edited: whether it
   * is a postal code is an open question. A replaced place does not take it over.
   */
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

/** The form of a shipment entered by hand. */
export function emptyFormValues(): ShipmentFormValues {
  const place = (): PlaceFormValues => ({ name: '', postalCode: '', country: '', coordinates: '', moveOthers: false })
  return { externalId: '', ldm: '', weight: '', description: '', pickup: place(), delivery: place() }
}

/**
 * A shipment entered by hand, or the errors of the form: the places and LDM are required,
 * the ID (empty: a short one by relation), the weight and the description are not.
 */
export function buildShipmentInput(
  values: ShipmentFormValues,
): { ok: true; input: ShipmentInput } | { ok: false; errors: ShipmentFormErrors } {
  const errors: ShipmentFormErrors = {}

  const ldmTenths = parseLdmTenths(values.ldm)
  if (ldmTenths === null || ldmTenths <= 0) errors.ldm = 'Unesite LDM veći od 0, sa najviše jednom decimalom (npr. 2,4).'

  const weightKg = parseKg(values.weight)
  if (weightKg === 'invalid') errors.weight = 'Unesite težinu u celim kilogramima ili ostavite polje prazno.'

  const places: Partial<Record<PlaceRole, PlaceInput>> = {}
  for (const role of ['pickup', 'delivery'] as const) {
    const place = values[role]
    const name = place.name.trim()
    if (!name) errors[role] = role === 'pickup' ? 'Unesite mesto preuzimanja.' : 'Unesite mesto isporuke.'
    const coordinates = parseCoordinates(place.coordinates)
    if (coordinates === 'invalid') errors[`${role}Coordinates`] = 'Unesite širinu i dužinu, npr. 45.2671, 19.8335.'
    const input: PlaceInput = { name, postalCode: null, country: place.country.trim().toUpperCase() || null }
    if (coordinates && coordinates !== 'invalid') input.coordinates = coordinates
    places[role] = input
  }

  if (Object.keys(errors).length > 0 || ldmTenths === null || weightKg === 'invalid' || !places.pickup || !places.delivery) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    input: {
      externalId: values.externalId.trim() || null,
      ldmTenths,
      weightKg,
      description: values.description.trim() || null,
      pickup: places.pickup,
      delivery: places.delivery,
    },
  }
}

/** The name differs: the shipment gets another place, not the same one corrected. */
export function placeReplaced(values: PlaceFormValues, initial: PlaceFormValues): boolean {
  return values.name.trim() !== initial.name
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
      postalCode: placeReplaced(place, start) ? null : start.postalCode || null,
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
export function describeUpdate(
  result: ShipmentUpdateResult,
  { created = false }: { created?: boolean } = {},
): { tone: 'success' | 'warning'; title: string; lines: string[] } {
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
    title: `Pošiljka „${result.shipment.externalId}“ je ${created ? 'dodata' : 'sačuvana'}.`,
    lines,
  }
}
