import { describe, expect, it } from 'vitest'
import { matchesQuery } from '../../src/app/search'

describe('matchesQuery', () => {
  it('finds every word, without regard to case or diacritics', () => {
    expect(matchesQuery('sleper 13,6', ['Šleper 1', '13,6 LDM'])).toBe(true)
    expect(matchesQuery('ĐURĐEVO', ['Đurđevo'])).toBe(true)
    expect(matchesQuery('djurdjevo', ['Đurđevo'])).toBe(false)
    expect(matchesQuery('sleper solo', ['Šleper 1'])).toBe(false)
  })

  it('takes everything for an empty query and skips missing parts', () => {
    expect(matchesQuery('   ', [])).toBe(true)
    expect(matchesQuery('7', [null, undefined, 7])).toBe(true)
  })
})
