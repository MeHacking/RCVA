import type { Truck, TruckInput, TruckType, TruckTypeInput } from '../../api/types'
import { apiMode } from '../../api/apiMode'
import { parsePhone } from '../../format/phone'
import { formatLdm, parseKg, parseLdmTenths, parseMm } from '../../format/units'

// The backend does not store a payload (B2 is only on the device), so the field would be lost there.
export const PAYLOAD_SUPPORTED = apiMode() !== 'server'
// Nor a driver (NOT IN SPEC v2, 08.11.2026).
export const DRIVER_SUPPORTED = apiMode() !== 'server'

/** Raw form state: text exactly as typed, converted to API units only on submit. */
export interface TruckFormValues {
  name: string
  capacityLdm: string
  /** empty: weight is not limited */
  capacityKg: string
  innerLengthMm: string
  innerWidthMm: string
  innerHeightMm: string
  available: boolean
  /** empty: no driver entered */
  driverName: string
  /** with the country code; empty: not entered */
  driverPhone: string
}

export type TruckFormField = keyof TruckFormValues | 'dimensions'
export type TruckFormErrors = Partial<Record<TruckFormField, string>>

export type TruckFormValidation = { ok: true; input: TruckInput } | { ok: false; errors: TruckFormErrors }

const DIMENSION_FIELDS = ['innerLengthMm', 'innerWidthMm', 'innerHeightMm'] as const

export function truckToFormValues(truck: Truck | null): TruckFormValues {
  if (!truck) {
    return {
      name: '',
      capacityLdm: '',
      capacityKg: '',
      innerLengthMm: '',
      innerWidthMm: '',
      innerHeightMm: '',
      available: true,
      driverName: '',
      driverPhone: '',
    }
  }
  return {
    name: truck.name,
    capacityLdm: formatLdm(truck.capacityLdmTenths),
    capacityKg: truck.capacityKg?.toString() ?? '',
    innerLengthMm: truck.innerLengthMm?.toString() ?? '',
    innerWidthMm: truck.innerWidthMm?.toString() ?? '',
    innerHeightMm: truck.innerHeightMm?.toString() ?? '',
    available: truck.available,
    driverName: truck.driverName ?? '',
    driverPhone: truck.driverPhone ?? '',
  }
}

export function validateTruckForm(values: TruckFormValues): TruckFormValidation {
  const errors: TruckFormErrors = {}

  const name = values.name.trim()
  if (name === '') errors.name = 'Unesite naziv kamiona.'

  const capacity = parseLdmTenths(values.capacityLdm)
  if (capacity === null) errors.capacityLdm = 'Unesite broj sa najviše jednom decimalom, npr. 13,6.'
  else if (capacity <= 0) errors.capacityLdm = 'Kapacitet mora biti veći od 0.'

  const capacityKg = parseKg(values.capacityKg)
  if (capacityKg === 'invalid') errors.capacityKg = 'Unesite pozitivan ceo broj kilograma, npr. 24000.'

  const dimensions = DIMENSION_FIELDS.map((field) => {
    const parsed = parseMm(values[field])
    if (parsed === 'invalid') errors[field] = 'Unesite pozitivan ceo broj milimetara.'
    return parsed === 'invalid' ? undefined : parsed
  })
  const given = dimensions.filter((d) => d !== null && d !== undefined).length
  const empty = dimensions.filter((d) => d === null).length
  // The 3D view needs all three; a partial set is almost certainly a typo.
  if (given > 0 && empty > 0) errors.dimensions = 'Unesite sve tri dimenzije tovarnog prostora ili nijednu.'

  const driverName = values.driverName.trim()
  const driverPhone = parsePhone(values.driverPhone)
  if (driverPhone === 'invalid') errors.driverPhone = 'Unesite broj sa pozivnim brojem zemlje, npr. +381 64 123 4567.'

  if (Object.keys(errors).length > 0 || capacity === null || capacityKg === 'invalid') return { ok: false, errors }

  const [innerLengthMm, innerWidthMm, innerHeightMm] = dimensions as (number | null)[]
  return {
    ok: true,
    input: {
      name,
      capacityLdmTenths: capacity,
      capacityKg,
      available: values.available,
      innerLengthMm,
      innerWidthMm,
      innerHeightMm,
      // Left out when empty, as the API stores it.
      ...(driverName !== '' && { driverName }),
      ...(driverPhone !== null && driverPhone !== 'invalid' && { driverPhone }),
    },
  }
}

/** A type in the same form, without availability (a type is never planned with). */
export function truckTypeToFormValues(type: Omit<TruckType, 'id'> | null): TruckFormValues {
  return truckToFormValues(type && { ...type, id: 0, available: true })
}

export type TruckTypeFormValidation = { ok: true; input: TruckTypeInput } | { ok: false; errors: TruckFormErrors }

/** The checks of a truck, with the name asked for as the type's. */
export function validateTruckTypeForm(values: TruckFormValues): TruckTypeFormValidation {
  const validation = validateTruckForm({ ...values, available: true })
  const errors: TruckFormErrors = validation.ok ? {} : { ...validation.errors }
  if (errors.name) errors.name = 'Unesite naziv tipa.'
  // A type fills a new truck completely, so (unlike a truck) every value is needed.
  if (PAYLOAD_SUPPORTED && values.capacityKg.trim() === '' && !errors.capacityKg) errors.capacityKg = 'Unesite nosivost tipa.'
  for (const field of DIMENSION_FIELDS) {
    if (values[field].trim() === '' && !errors[field]) errors[field] = 'Obavezno.'
  }
  if (DIMENSION_FIELDS.some((field) => values[field].trim() === '')) {
    errors.dimensions = 'Unesite sve tri dimenzije tovarnog prostora.'
  }
  if (!validation.ok || Object.keys(errors).length > 0) return { ok: false, errors }
  const { name, capacityLdmTenths, capacityKg, innerLengthMm, innerWidthMm, innerHeightMm } = validation.input
  return { ok: true, input: { name, capacityLdmTenths, capacityKg, innerLengthMm, innerWidthMm, innerHeightMm } }
}

/** Maps 400 field errors from the API (TruckInput field names) onto form fields. */
export function apiErrorsToForm(errors: Record<string, string>): TruckFormErrors {
  const mapped: TruckFormErrors = {}
  for (const [field, message] of Object.entries(errors)) {
    if (field === 'capacityLdmTenths') mapped.capacityLdm = message
    else if (
      field === 'name' ||
      field === 'capacityKg' ||
      field === 'driverName' ||
      field === 'driverPhone' ||
      (DIMENSION_FIELDS as readonly string[]).includes(field)
    ) {
      mapped[field as TruckFormField] = message
    }
  }
  return mapped
}

/** Props of one input of a truck form: its id and the link to its error. */
export function fieldPropsFor(id: string, errors: TruckFormErrors) {
  return (field: TruckFormField) => ({
    id: `${id}-${field}`,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined,
  })
}
