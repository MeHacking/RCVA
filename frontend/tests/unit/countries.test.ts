import { describe, expect, it } from 'vitest'
import { searchUrl } from '../../src/api/local/nominatim'
import { COUNTRIES, countryOptions, isoCountryCode } from '../../src/domain/countries'

describe('countries', () => {
  it('has each code and name once, and every code goes to Nominatim', () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length)
    expect(new Set(COUNTRIES.map((c) => c.name)).size).toBe(COUNTRIES.length)
    for (const { code } of COUNTRIES) {
      expect(new URL(searchUrl({ name: 'Mesto', country: code }, null)).searchParams.get('countrycodes')).toBe(code.toLowerCase())
    }
  })

  it('is in the order of the Serbian alphabet', () => {
    const names = COUNTRIES.map((c) => c.name)
    expect(names).toEqual([...names].sort(new Intl.Collator('sr-Latn').compare))
  })

  it('reads Bosnia as written in the files, and any letter case', () => {
    expect(isoCountryCode('BIH')).toBe('BA')
    expect(isoCountryCode(' se ')).toBe('SE')
    expect(isoCountryCode('')).toBe('')
  })

  it('adds no choice for an empty or a listed country, BIH included', () => {
    expect(countryOptions('')).toBe(COUNTRIES)
    expect(countryOptions('SE')).toBe(COUNTRIES)
    expect(countryOptions('BIH')).toBe(COUNTRIES)
  })

  it('keeps a stored country that is not on the list', () => {
    expect(countryOptions('US')).toEqual([{ code: 'US', name: 'US' }, ...COUNTRIES])
  })
})
