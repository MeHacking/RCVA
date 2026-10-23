import { describe, expect, it } from 'vitest'
import {
  formatDimensionsMm,
  formatKg,
  formatKm,
  formatLdm,
  formatScore,
  formatUtilization,
  parseLdmTenths,
  parseMm,
} from '../../src/format/units'

describe('formatLdm', () => {
  it.each([
    [136, '13,6'],
    [100, '10,0'],
    [5, '0,5'],
    [0, '0,0'],
    [1150, '115,0'],
  ])('%i tenths -> %s', (tenths, expected) => {
    expect(formatLdm(tenths)).toBe(expected)
  })
})

describe('formatKm', () => {
  it.each([
    [1001489, '1001,5 km'], // test 7, specification v2
    [800998, '801,0 km'], // test 7, original prompt (CVRP variant)
    [500000, '500,0 km'],
    [0, '0,0 km'],
    [49, '0,0 km'],
    [50, '0,1 km'],
    [-1001489, '-1001,5 km'],
  ])('%i m -> %s', (meters, expected) => {
    expect(formatKm(meters)).toBe(expected)
  })
})

describe('formatKg', () => {
  it('keeps whole kilograms and uses a decimal comma otherwise', () => {
    expect(formatKg(3200)).toBe('3200')
    expect(formatKg(1.5)).toBe('1,5')
  })
})

describe('formatDimensionsMm', () => {
  it('formats all three dimensions', () => {
    expect(formatDimensionsMm(13600, 2480, 2700)).toBe('13600 × 2480 × 2700 mm')
  })
  it('returns null when a dimension is missing', () => {
    expect(formatDimensionsMm(13600, null, 2700)).toBeNull()
  })
})

describe('formatScore', () => {
  it('uses Timefold notation', () => {
    expect(formatScore(0, -2, -1001489)).toBe('0hard/-2medium/-1001489soft')
  })
})

describe('formatUtilization', () => {
  it('rounds to a whole percent', () => {
    expect(formatUtilization(134, 136)).toBe('99 %')
    expect(formatUtilization(100, 100)).toBe('100 %')
  })
  it('does not divide by zero', () => {
    expect(formatUtilization(10, 0)).toBe('–')
  })
})

describe('parseLdmTenths', () => {
  it.each([
    ['13,6', 136],
    ['13.6', 136],
    [' 7 ', 70],
    ['0', 0],
    ['0,5', 5],
  ])('%s -> %i', (input, expected) => {
    expect(parseLdmTenths(input)).toBe(expected)
  })

  it.each(['', '1,25', '-1', 'abc', '13,', ',5', '1e2', '13 6'])('rejects %j', (input) => {
    expect(parseLdmTenths(input)).toBeNull()
  })
})

describe('parseMm', () => {
  it('treats empty input as not given', () => {
    expect(parseMm('  ')).toBeNull()
  })
  it('accepts positive whole numbers', () => {
    expect(parseMm('2480')).toBe(2480)
  })
  it.each(['0', '-5', '12.5', 'abc'])('rejects %j', (input) => {
    expect(parseMm(input)).toBe('invalid')
  })
})
