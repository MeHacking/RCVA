import { describe, expect, it } from 'vitest'
import {
  apiErrorsToForm,
  truckToFormValues,
  validateTruckForm,
  type TruckFormValues,
} from '../../src/features/trucks/truckFormValidation'

const VALID: TruckFormValues = {
  name: '  Šleper 9 ',
  capacityLdm: '13,6',
  innerLengthMm: '13600',
  innerWidthMm: '2480',
  innerHeightMm: '2700',
  available: true,
}

describe('validateTruckForm', () => {
  it('converts valid input to API units', () => {
    expect(validateTruckForm(VALID)).toEqual({
      ok: true,
      input: {
        name: 'Šleper 9',
        capacityLdmTenths: 136,
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

describe('truckToFormValues', () => {
  it('round-trips an existing truck through the form', () => {
    const truck = {
      id: 1,
      name: 'Solo 1',
      capacityLdmTenths: 70,
      available: false,
      innerLengthMm: null,
      innerWidthMm: null,
      innerHeightMm: null,
    }
    const values = truckToFormValues(truck)
    expect(values.capacityLdm).toBe('7,0')
    expect(validateTruckForm(values)).toEqual({ ok: true, input: { ...truck, id: undefined } })
  })
})

describe('apiErrorsToForm', () => {
  it('maps API field names onto form fields', () => {
    expect(apiErrorsToForm({ capacityLdmTenths: 'x', innerLengthMm: 'y', unknown: 'z' })).toEqual({
      capacityLdm: 'x',
      innerLengthMm: 'y',
    })
  })
})
