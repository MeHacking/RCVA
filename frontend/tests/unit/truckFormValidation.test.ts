import { describe, expect, it } from 'vitest'
import {
  apiErrorsToForm,
  truckToFormValues,
  truckTypeToFormValues,
  validateTruckForm,
  validateTruckTypeForm,
  type TruckFormValues,
} from '../../src/features/trucks/truckFormValidation'

const VALID: TruckFormValues = {
  name: '  Šleper 9 ',
  capacityLdm: '13,6',
  capacityKg: '24000',
  innerLengthMm: '13600',
  innerWidthMm: '2480',
  innerHeightMm: '2700',
  available: true,
  driverName: '',
  driverPhone: '',
}

describe('validateTruckForm', () => {
  it('converts valid input to API units', () => {
    expect(validateTruckForm(VALID)).toEqual({
      ok: true,
      input: {
        name: 'Šleper 9',
        capacityLdmTenths: 136,
        capacityKg: 24000,
        available: true,
        innerLengthMm: 13600,
        innerWidthMm: 2480,
        innerHeightMm: 2700,
      },
    })
  })

  it('accepts a truck without cargo dimensions', () => {
    const result = validateTruckForm({ ...VALID, innerLengthMm: '', innerWidthMm: '', innerHeightMm: '' })
    expect(result).toMatchObject({ ok: true, input: { innerLengthMm: null, innerWidthMm: null, innerHeightMm: null } })
  })

  it.each(['0', '0,0'])('rejects capacity %j: must be > 0', (capacityLdm) => {
    expect(validateTruckForm({ ...VALID, capacityLdm })).toEqual({
      ok: false,
      errors: { capacityLdm: 'Kapacitet mora biti veći od 0.' },
    })
  })

  it.each(['', '-1', '1,25', 'abc'])('rejects unparsable capacity %j', (capacityLdm) => {
    const result = validateTruckForm({ ...VALID, capacityLdm })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.capacityLdm).toMatch(/najviše jednom decimalom/)
  })

  it('requires a name', () => {
    const result = validateTruckForm({ ...VALID, name: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveProperty('name')
  })

  it('rejects invalid and partial dimensions', () => {
    const invalid = validateTruckForm({ ...VALID, innerWidthMm: '0' })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.errors).toHaveProperty('innerWidthMm')

    const partial = validateTruckForm({ ...VALID, innerHeightMm: '' })
    expect(partial.ok).toBe(false)
    if (!partial.ok) expect(partial.errors).toHaveProperty('dimensions')
  })
})

describe('payload', () => {
  it('leaves an empty payload unlimited', () => {
    const result = validateTruckForm({ ...VALID, capacityKg: '  ' })
    expect(result.ok && result.input.capacityKg).toBeNull()
  })

  it.each(['0', '-5', '1,5', '24 t'])('rejects payload %j', (capacityKg) => {
    expect(validateTruckForm({ ...VALID, capacityKg })).toEqual({
      ok: false,
      errors: { capacityKg: 'Unesite pozitivan ceo broj kilograma, npr. 24000.' },
    })
  })

  it('shows an unlimited truck with an empty field', () => {
    const values = truckToFormValues({ id: 1, name: 'A', capacityLdmTenths: 10, capacityKg: null, available: true, innerLengthMm: null, innerWidthMm: null, innerHeightMm: null })
    expect(values.capacityKg).toBe('')
  })
})

describe('driver', () => {
  it('keeps the name and the phone as typed, without surrounding spaces', () => {
    const result = validateTruckForm({ ...VALID, driverName: '  Petar Petrović ', driverPhone: ' +381 64  123 4567 ' })
    expect(result).toMatchObject({ ok: true, input: { driverName: 'Petar Petrović', driverPhone: '+381 64 123 4567' } })
  })

  it('leaves out a driver not entered, as the API stores it', () => {
    const result = validateTruckForm({ ...VALID, driverName: '   ', driverPhone: '' })
    expect(result.ok && 'driverName' in result.input).toBe(false)
    expect(result.ok && 'driverPhone' in result.input).toBe(false)
  })

  it('asks for a phone with the country code', () => {
    expect(validateTruckForm({ ...VALID, driverPhone: '064 123 4567' })).toEqual({
      ok: false,
      errors: { driverPhone: 'Unesite broj sa pozivnim brojem zemlje, npr. +381 64 123 4567.' },
    })
  })
})

describe('truckToFormValues', () => {
  it('round-trips an existing truck through the form', () => {
    const truck = {
      id: 1,
      name: 'Solo 1',
      capacityLdmTenths: 70,
      capacityKg: 12000,
      available: false,
      innerLengthMm: null,
      innerWidthMm: null,
      innerHeightMm: null,
      driverName: 'Ana',
      driverPhone: '+46 70 123 45 67',
    }
    const values = truckToFormValues(truck)
    expect(values.capacityLdm).toBe('7,0')
    expect(validateTruckForm(values)).toEqual({ ok: true, input: { ...truck, id: undefined } })
  })
})

describe('apiErrorsToForm', () => {
  it('maps API field names onto form fields', () => {
    expect(
      apiErrorsToForm({ capacityLdmTenths: 'x', capacityKg: 'w', innerLengthMm: 'y', driverPhone: 'p', unknown: 'z' }),
    ).toEqual({
      capacityLdm: 'x',
      capacityKg: 'w',
      innerLengthMm: 'y',
      driverPhone: 'p',
    })
  })
})

describe('validateTruckTypeForm', () => {
  it('gives a type without availability, also from a form marked unavailable', () => {
    expect(validateTruckTypeForm({ ...VALID, available: false })).toEqual({
      ok: true,
      input: { name: 'Šleper 9', capacityLdmTenths: 136, capacityKg: 24000, innerLengthMm: 13600, innerWidthMm: 2480, innerHeightMm: 2700 },
    })
  })

  it('asks for the name of the type and checks the measures as for a truck', () => {
    expect(validateTruckTypeForm({ ...VALID, name: ' ', capacityLdm: '0', innerWidthMm: '' })).toEqual({
      ok: false,
      errors: {
        name: 'Unesite naziv tipa.',
        capacityLdm: 'Kapacitet mora biti veći od 0.',
        innerWidthMm: 'Obavezno.',
        dimensions: 'Unesite sve tri dimenzije tovarnog prostora.',
      },
    })
  })

  it('needs every value of a type: the payload and all three dimensions, unlike a truck', () => {
    const empty = { ...VALID, capacityKg: '', innerLengthMm: '', innerWidthMm: '', innerHeightMm: '' }
    expect(validateTruckTypeForm(empty)).toEqual({
      ok: false,
      errors: {
        capacityKg: 'Unesite nosivost tipa.',
        innerLengthMm: 'Obavezno.',
        innerWidthMm: 'Obavezno.',
        innerHeightMm: 'Obavezno.',
        dimensions: 'Unesite sve tri dimenzije tovarnog prostora.',
      },
    })
    // A truck may still leave them empty.
    expect(validateTruckForm(empty).ok).toBe(true)
  })

  it('fills the form from a type', () => {
    const { available, ...values } = truckTypeToFormValues({
      name: 'Solo',
      capacityLdmTenths: 70,
      capacityKg: null,
      innerLengthMm: null,
      innerWidthMm: null,
      innerHeightMm: null,
    })
    expect(available).toBe(true)
    expect(values).toEqual({ name: 'Solo', capacityLdm: '7,0', capacityKg: '', innerLengthMm: '', innerWidthMm: '', innerHeightMm: '', driverName: '', driverPhone: '' })
    expect(truckTypeToFormValues(null)).toEqual(truckToFormValues(null))
  })
})
