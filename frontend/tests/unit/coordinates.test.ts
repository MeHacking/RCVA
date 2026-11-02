import { describe, expect, it } from 'vitest'
import { formatCoordinates, parseCoordinates } from '../../src/format/coordinates'

describe('parseCoordinates', () => {
  it.each([
    ['45.2671, 19.8335', { lat: 45.2671, lon: 19.8335 }], // as Google Maps copies them
    ['45.2671,19.8335', { lat: 45.2671, lon: 19.8335 }],
    ['45,2671, 19,8335', { lat: 45.2671, lon: 19.8335 }],
    ['45,2671 19,8335', { lat: 45.2671, lon: 19.8335 }],
    ['45,2671; 19,8335', { lat: 45.2671, lon: 19.8335 }],
    [' -33.9 , -70.6 ', { lat: -33.9, lon: -70.6 }],
    ['90, 180', { lat: 90, lon: 180 }],
  ])('%s', (input, expected) => {
    expect(parseCoordinates(input)).toEqual(expected)
  })

  it('reads empty input as not given', () => {
    expect(parseCoordinates('  ')).toBeNull()
  })

  it.each(['45.2671', 'Novi Sad', '45.2671, 19.8335, 3', '91, 19', '45, 181', '45.2.1, 19', '45° N, 19° E'])(
    'rejects %s',
    (input) => {
      expect(parseCoordinates(input)).toBe('invalid')
    },
  )
})

describe('formatCoordinates', () => {
  it('writes degrees with a decimal comma and the hemisphere', () => {
    expect(formatCoordinates({ lat: 45.2671, lon: 19.8335 })).toBe('45,26710° N, 19,83350° E')
    expect(formatCoordinates({ lat: -33.9, lon: -70.6 })).toBe('33,90000° S, 70,60000° W')
  })
})
