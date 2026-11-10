import { describe, expect, it } from 'vitest'
import { searchUrl } from '../../src/api/local/nominatim'
import { COUNTRIES, RECENT_COUNTRIES, countryGroups, isoCountryCode, withRecentCountry } from '../../src/domain/countries'

const codes = (countries: { code: string }[]) => countries.map((c) => c.code)

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
})

describe('countryGroups', () => {
  it('always has the top filled, and every country once', () => {
    const { recent, others } = countryGroups('', [])
    expect(recent).toHaveLength(RECENT_COUNTRIES)
    expect(codes([...recent, ...others]).sort()).toEqual(codes([...COUNTRIES]).sort())
  })

  it('puts the recent ones first, in the order they were used', () => {
    const { recent, others } = countryGroups('', ['FI', 'SE'])
    expect(codes(recent).slice(0, 3)).toEqual(['FI', 'SE', 'RS'])
    expect(recent).toHaveLength(RECENT_COUNTRIES)
    expect(codes(others)).not.toContain('FI')
  })

  it('leaves the rest in the order of the list', () => {
    const { others } = countryGroups('', ['FI'])
    expect(others).toEqual(COUNTRIES.filter((c) => others.includes(c)))
  })

  it('ignores a remembered code that is not on the list', () => {
    expect(codes(countryGroups('', ['XX']).recent)).not.toContain('XX')
  })

  it('adds no choice for a listed country, BIH included', () => {
    for (const stored of ['SE', 'BIH', 'FI']) {
      const { recent, others } = countryGroups(stored, [])
      expect(recent.length + others.length).toBe(COUNTRIES.length)
    }
  })

  it('keeps a stored country that is not on the list', () => {
    expect(countryGroups('US', []).others[0]).toEqual({ code: 'US', name: 'US' })
  })
})

describe('withRecentCountry', () => {
  it('puts the chosen one first, once', () => {
    expect(withRecentCountry(['SE', 'FI', 'RS'], 'FI')).toEqual(['FI', 'SE', 'RS'])
  })

  it('keeps only the most recent ones', () => {
    const full = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    expect(withRecentCountry(full, 'X')).toEqual(['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G'])
  })
})
