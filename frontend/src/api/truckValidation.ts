import { ApiError } from './client'
import type { TruckInput } from './types'

/** Server-side checks of a truck (400 with field errors); the same messages as the backend's TruckService. */
export function assertValidTruck(input: TruckInput): void {
  const errors: Record<string, string> = {}
  if (input.name.trim() === '') errors.name = 'Naziv je obavezan.'
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
  if (Object.keys(errors).length > 0) {
    throw new ApiError({ title: 'Neispravni podaci o kamionu', status: 400, errors })
  }
}
