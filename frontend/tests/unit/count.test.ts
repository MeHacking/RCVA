import { describe, expect, it } from 'vitest'
import { formatShipmentCount } from '../../src/format/count'

describe('formatShipmentCount', () => {
  it.each([
    [1, '1 pošiljka'],
    [2, '2 pošiljke'],
    [4, '4 pošiljke'],
    [5, '5 pošiljki'],
    [11, '11 pošiljki'],
    [12, '12 pošiljki'],
    [14, '14 pošiljki'],
    [21, '21 pošiljka'],
    [22, '22 pošiljke'],
    [0, '0 pošiljki'],
  ])('%i -> %j', (n, text) => {
    expect(formatShipmentCount(n)).toBe(text)
  })
})
