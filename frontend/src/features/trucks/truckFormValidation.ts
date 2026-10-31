import type { Truck, TruckInput } from '../../api/types'
import { formatLdm, parseKg, parseLdmTenths, parseMm } from '../../format/units'

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
}

export type TruckFormField = keyof TruckFormValues | 'dimensions'
export type TruckFormErrors = Partial<Record<TruckFormField, string>>

export type TruckFormValidation = { ok: true; input: TruckInput } | { ok: false; errors: TruckFormErrors }

const DIMENSION_FIELDS = ['innerLengthMm', 'innerWidthMm', 'innerHeightMm'] as const

export function truckToFormValues(truck: Truck | null): TruckFormValues {
  if (!truck) {
    return { name: '', capacityLdm: '', capacityKg: '', innerLengthMm: '', innerWidthMm: '', innerHeightMm: '', available: true }
  }
  return {
    name: truck.name,
    capacityLdm: formatLdm(truck.capacityLdmTenths),
    capacityKg: truck.capacityKg?.toString() ?? '',
    innerLengthMm: truck.innerLengthMm?.toString() ?? '',
    innerWidthMm: truck.innerWidthMm?.toString() ?? '',
    innerHeightMm: truck.innerHeightMm?.toString() ?? '',
    available: truck.available,
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

  if (Object.keys(errors).length > 0 || capacity === null || capacityKg === 'invalid') return { ok: false, errors }

  const [innerLengthMm, innerWidthMm, innerHeightMm] = dimensions as (number | null)[]
  return {
    ok: true,
    input: { name, capacityLdmTenths: capacity, capacityKg, available: values.available, innerLengthMm, innerWidthMm, innerHeightMm },
  }
}

/** Maps 400 field errors from the API (TruckInput field names) onto form fields. */
export function apiErrorsToForm(errors: Record<string, string>): TruckFormErrors {
  const mapped: TruckFormErrors = {}
  for (const [field, message] of Object.entries(errors)) {
    if (field === 'capacityLdmTenths') mapped.capacityLdm = message
    else if (field === 'name' || field === 'capacityKg' || (DIMENSION_FIELDS as readonly string[]).includes(field)) {
      mapped[field as TruckFormField] = message
    }
  }
  return mapped
}
