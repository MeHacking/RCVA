import { describe, expect, it } from 'vitest'
import { internationalPhone, parsePhone } from '../../src/format/phone'

describe('parsePhone', () => {
  it.each([
    ['+381 64 123 4567', '+381 64 123 4567'],
    ['  +381   64 123 4567 ', '+381 64 123 4567'], // spaces collapsed
    ['00381 64/123-4567', '00381 64/123-4567'],
    ['+46 (0)70 123 45 67', '+46 (0)70 123 45 67'],
    ['+47.912.34.567', '+47.912.34.567'],
  ])('keeps %j as typed', (input, expected) => {
    expect(parsePhone(input)).toBe(expected)
  })

  it('reads empty input as not given', () => {
    expect(parsePhone('   ')).toBeNull()
  })

  it.each([
    '064 123 4567', // no country code
    '+381 64 ABC 4567',
    '+381 64', // too few digits
    '+381 64 123 4567 8901 23', // more than 15
    '+0381 64 123 4567', // no country code starts with 0
    '+',
  ])('rejects %j', (input) => {
    expect(parsePhone(input)).toBe('invalid')
  })
})

describe('internationalPhone', () => {
  it.each([
    ['+381 64 123 4567', '+381641234567'],
    ['00381 64/123-4567', '+381641234567'],
    ['+46 (0)70 123 45 67', '+46701234567'], // the trunk "0" is not dialled from abroad
    ['+47.912.34.567', '+4791234567'],
  ])('%j -> %j', (input, expected) => {
    expect(internationalPhone(input)).toBe(expected)
  })
})
