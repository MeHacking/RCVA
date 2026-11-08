import { ApiError } from './client'
import { STANDARD_TRUCK } from '../domain/fleet'
import { parsePhone } from '../format/phone'
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
  if (input.driverPhone != null && parsePhone(input.driverPhone) === 'invalid') {
    errors.driverPhone = 'Broj telefona mora imati pozivni broj zemlje, npr. +381 64 123 4567.'
  }
  if (Object.keys(errors).length > 0) {
    throw new ApiError({ title: 'Neispravni podaci o kamionu', status: 400, errors })
  }
}

/** The stored form of a checked truck: the driver without surrounding spaces, and left out when empty. */
export function cleanTruckInput(input: TruckInput): TruckInput {
  const { driverName, driverPhone, ...rest } = input
  const name = driverName?.trim() ?? ''
  const phone = driverPhone == null ? null : parsePhone(driverPhone)
  return { ...rest, ...(name !== '' && { driverName: name }), ...(typeof phone === 'string' && { driverPhone: phone }) }
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('sr') === b.trim().toLocaleLowerCase('sr')

/**
 * Checks of a truck type (400 with field errors): the measures as for a truck, and a name no
 * other type has (without case and surrounding spaces), nor the built-in standard one.
 * `id` is the type being changed (null for a new one).
 */
export function assertValidTruckType(input: TruckTypeInput, types: TruckType[], id: number | null): void {
  const errors = measureErrors(input)
  // Unlike a truck, a type has every value: it fills a new truck completely.
  if (input.capacityKg === null) errors.capacityKg = 'Nosivost je obavezna.'
  for (const field of ['innerLengthMm', 'innerWidthMm', 'innerHeightMm'] as const) {
    if (input[field] === null) errors[field] = 'Obavezno.'
  }
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
