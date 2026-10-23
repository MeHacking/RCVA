import { describe, expect, it } from 'vitest'
import { parseRelation, parsePlace } from '../../src/api/mock/import/parseRelation'
import { parseLdmCell, parseWeight } from '../../src/api/mock/import/parseQuantities'
import { geocode, normalizePlaceName } from '../../src/api/mock/import/gazetteer'

// Invented rows with the same shapes as the real Excel file (the real data stays local).

describe('parseRelation', () => {
  it.each([
    ['NOVI SAD 21000 - MALMO', { name: 'Novi Sad', postalCode: null, country: null }, { name: 'Malmo', postalCode: '21000', country: null }],
    ['NIS / RS / -/ SE / 55555 VAXJO', { name: 'Nis', postalCode: null, country: 'RS' }, { name: 'Vaxjo', postalCode: '55555', country: 'SE' }],
    ['SOMBOR - NO 1234 DRAMMEN', { name: 'Sombor', postalCode: null, country: null }, { name: 'Drammen', postalCode: '1234', country: 'NO' }],
    ['Valjevo 12345- umea', { name: 'Valjevo', postalCode: null, country: null }, { name: 'Umea', postalCode: '12345', country: null }],
    ['Bitola / MK / - Lund 22222', { name: 'Bitola', postalCode: null, country: 'MK' }, { name: 'Lund', postalCode: '22222', country: null }],
    ['INDJIJA-KALMAR 39234', { name: 'Indjija', postalCode: null, country: null }, { name: 'Kalmar', postalCode: '39234', country: null }],
    ['Bihac / BIH / - / Lulea 97234/', { name: 'Bihac', postalCode: null, country: 'BIH' }, { name: 'Lulea', postalCode: '97234', country: null }],
  ])('%s', (text, pickup, delivery) => {
    expect(parseRelation(text)).toEqual({ pickup, delivery, issues: [] })
  })

  it('assigns a postal code written next to the pickup to the delivery', () => {
    const { pickup, delivery } = parseRelation('ČAČAK 34131 - LJUNGBY')
    expect(pickup).toEqual({ name: 'Čačak', postalCode: null, country: null })
    expect(delivery?.postalCode).toBe('34131')
  })

  it('reports a relation without a pickup place', () => {
    const parsed = parseRelation('12345 SODERTALJE')
    expect(parsed.pickup).toBeNull()
    expect(parsed.delivery).toEqual({ name: 'Sodertalje', postalCode: '12345', country: null })
  })

  it('reports several destinations in one relation', () => {
    const parsed = parseRelation('ZAJECAR 11111-YSTAD, 22222 LUND')
    expect(parsed.issues).toEqual(['Više odredišta u jednoj relaciji; podelite ih na posebne redove ili ispravite ručno.'])
    expect(parsed.delivery?.postalCode).toBeNull()
  })

  it('reports a postal code that is neither 4 nor 5 digits', () => {
    const parsed = parseRelation('BEOGRAD 123456 - KIRUNA')
    expect(parsed.issues).toEqual(['Neispravan poštanski broj „123456“ (očekuje se 4 ili 5 cifara).'])
    expect(parsed.delivery).toEqual({ name: 'Kiruna', postalCode: null, country: null })
  })
})

describe('parsePlace (separate pickup/delivery columns)', () => {
  it('takes the postal code from its own column first, then from the text', () => {
    expect(parsePlace('Malmo', '21145')).toEqual({ name: 'Malmo', postalCode: '21145', country: null })
    expect(parsePlace('SE 21145 MALMO', null)).toEqual({ name: 'Malmo', postalCode: '21145', country: 'SE' })
    expect(parsePlace('  ', null)).toBeNull()
  })
})

describe('parseWeight', () => {
  it.each([
    ['4,200 kg', 4200],
    ['12,800 kg', 12800],
    ['1,200kg', 1200],
    ['500kg', 500],
    ['30kg', 30],
    ['5,3t', 5300],
    ['2t', 2000],
    ['1.5 t', 1500],
  ])('%s -> %i kg without warning', (text, kg) => {
    expect(parseWeight(text)).toEqual({ kg, warning: null })
  })

  it('warns when a comma does not look like thousands', () => {
    expect(parseWeight('1,5 kg')).toEqual({
      kg: 1.5,
      warning: 'Zarez u težini „1,5 kg“ ne liči na hiljade; protumačeno kao decimala. Proverite.',
    })
  })

  it('assumes kg without a unit, with a warning', () => {
    expect(parseWeight('800').kg).toBe(800)
    expect(parseWeight('800').warning).toMatch(/nema jedinicu/)
  })

  it('accepts an empty cell and rejects text', () => {
    expect(parseWeight('')).toEqual({ kg: null, warning: null })
    expect(parseWeight('teško').kg).toBeNull()
    expect(parseWeight('teško').warning).toMatch(/nije prepoznata/)
  })
})

describe('parseLdmCell', () => {
  it.each([
    ['2,4m', 24],
    ['3.6m', 36],
    ['1m', 10],
    ['0.1m', 1],
    ['11,5m', 115],
    ['2,4', 24],
    ['7 LDM', 70],
  ])('%s -> %i tenths', (text, tenths) => {
    expect(parseLdmCell(text)).toBe(tenths)
  })

  it.each(['', 'abc', '2,45m', '-1m', '2,4 m2'])('rejects %j', (text) => {
    expect(parseLdmCell(text)).toBeNull()
  })
})

describe('mock geocoding', () => {
  it('ignores case and diacritics', () => {
    expect(normalizePlaceName('  Göteborg ')).toBe('goteborg')
    expect(geocode('NIŠ')).not.toBeNull()
    expect(geocode('Vaxjo')).toBeNull()
  })
})
