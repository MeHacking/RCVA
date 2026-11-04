import { ApiError } from './client'
import { STANDARD_TRUCK } from '../domain/fleet'
import type { TruckInput, TruckType, TruckTypeInput } from './types'

/** The name of the built-in truck type (STANDARD_TRUCK); no type the user adds may take it. */
export const STANDARD_TYPE_NAME = 'Standardna cerada'

type Measures = Pick<TruckInput, 'capacityLdmTenths' | 'capacityKg' | 'innerLengthMm' | 'innerWidthMm' | 'innerHeightMm'>

function measureErrors(input: Measures): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!Number.isInteger(input.capacityLdmTenths) || input.capacityLdmTenths <= 0) {
    errors.capacityLdmTenths = 'Kapacitet mora biti veći od 0.'
  }
  if (input.capacityKg !== null && (!Number.isInteger(input.capacityKg) || input.capacityKg <= 0)) {
    errors.capacityKg = 'Nosivost mora biti pozitivan ceo broj kilograma.'
  }
  for (const field of ['innerLengthMm', 'innerWidthMm', 'innerHeightMm'] as const) {
    const value = input[field]
    if (value !== null && (!Number.isInteger(value) || value <= 0)) errors[field] = 'Mora biti pozitivan ceo broj.'
  }
  return errors
}

/** Server-side checks of a truck (400 with field errors); the same messages as the backend's TruckService. */
export function assertValidTruck(input: TruckInput): void {
  const errors = measureErrors(input)
  if (input.name.trim() === '') errors.name = 'Naziv je obavezan.'
  if (Object.keys(errors).length > 0) {
    throw new ApiError({ title: 'Neispravni podaci o kamionu', status: 400, errors })
  }
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('sr') === b.trim().toLocaleLowerCase('sr')

/**
 * Checks of a truck type (400 with field errors): the measures as for a truck, and a name no
 * other type has (without case and surrounding spaces), nor the built-in standard one.
 * `id` is the type being changed (null for a new one).
 */
export function assertValidTruckType(input: TruckTypeInput, types: TruckType[], id: number | null): void {
  const errors = measureErrors(input)
  if (input.name.trim() === '') errors.name = 'Naziv je obavezan.'
  else if (sameName(input.name, STANDARD_TYPE_NAME)) errors.name = `„${STANDARD_TYPE_NAME}“ je ugrađen tip; izaberite drugi naziv.`
  else if (types.some((t) => t.id !== id && sameName(t.name, input.name))) errors.name = 'Tip sa tim nazivom već postoji.'
  // Another name for a type there is already is a duplicate too (the built-in one included).
  if (Object.keys(errors).length === 0) {
    const twin = sameMeasures(input, STANDARD_TRUCK)
      ? STANDARD_TYPE_NAME
      : types.find((t) => t.id !== id && sameMeasures(input, t))?.name
    if (twin) errors.name = `Tip „${twin}“ već ima iste mere (kapacitet, nosivost i tovarni prostor).`
  }
  if (Object.keys(errors).length > 0) {
    throw new ApiError({ title: 'Neispravni podaci o tipu kamiona', status: 400, errors })
  }
}

function sameMeasures(a: Measures, b: Measures): boolean {
  return (
    a.capacityLdmTenths === b.capacityLdmTenths &&
    a.capacityKg === b.capacityKg &&
    a.innerLengthMm === b.innerLengthMm &&
    a.innerWidthMm === b.innerWidthMm &&
    a.innerHeightMm === b.innerHeightMm
  )
}

/** The stored form of a type: the name without surrounding spaces, only the known fields. */
export function toTruckType(id: number, input: TruckTypeInput): TruckType {
  const { capacityLdmTenths, capacityKg, innerLengthMm, innerWidthMm, innerHeightMm } = input
  return { id, name: input.name.trim(), capacityLdmTenths, capacityKg, innerLengthMm, innerWidthMm, innerHeightMm }
}
