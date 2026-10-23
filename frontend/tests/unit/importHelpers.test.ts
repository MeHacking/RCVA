import { describe, expect, it } from 'vitest'
import type { ImportRow } from '../../src/api/types'
import { columnLetter, suggestMapping, summarizeImport } from '../../src/features/shipments/import/importHelpers'

describe('suggestMapping', () => {
  it('maps the columns of the real file layout', () => {
    expect(suggestMapping(['RELACIJA', 'TEŽINA', 'DIMENZIJE'])).toEqual({ relation: 0, weight: 1, ldm: 2 })
  })

  it('maps separate pickup and delivery columns', () => {
    expect(suggestMapping(['ID', 'Mesto preuzimanja', 'Mesto isporuke', 'Poštanski broj', 'Utovarni metri', 'Opis robe'])).toEqual({
      externalId: 0,
      pickup: 1,
      delivery: 2,
      deliveryPostalCode: 3,
      ldm: 4,
      description: 5,
    })
  })

  it('leaves unknown columns unmapped and never reuses a column', () => {
    expect(suggestMapping(['Napomena', 'LDM', 'LDM (rezerva)'])).toEqual({ ldm: 1 })
  })
})

describe('columnLetter', () => {
  it.each([
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
    [701, 'ZZ'],
  ])('%i -> %s', (index, letter) => {
    expect(columnLetter(index)).toBe(letter)
  })
})

describe('summarizeImport', () => {
  const row = (patch: Partial<ImportRow>): ImportRow => ({
    rowNumber: 2,
    sourceText: '',
    externalId: 'X',
    pickup: null,
    delivery: null,
    ldmTenths: 10,
    weightKg: null,
    description: null,
    errors: [],
    warnings: [],
    excluded: false,
    corrected: false,
    ...patch,
  })

  it('counts excluded rows separately from rows with errors', () => {
    expect(
      summarizeImport([
        row({}),
        row({ warnings: ['w'], corrected: true }),
        row({ errors: ['e'] }),
        row({ errors: ['e'], excluded: true }),
      ]),
    ).toEqual({ total: 4, ready: 2, withErrors: 1, excluded: 1, corrected: 1 })
  })
})
