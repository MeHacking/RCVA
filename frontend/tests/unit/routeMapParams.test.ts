import { describe, expect, it } from 'vitest'
import { parseRouteMapParams } from '../../src/features/route-map/routeMapParams'

const parse = (query: string) => parseRouteMapParams(new URLSearchParams(query))

describe('parseRouteMapParams', () => {
  it('reads job and truck ids', () => {
    expect(parse('?job=1&truck=2')).toEqual({ jobId: 1, truckId: 2 })
  })

  it('treats missing parameters as null', () => {
    expect(parse('')).toEqual({ jobId: null, truckId: null })
  })

  it.each(['0', '-1', '1.5', 'abc', '', '99999999999999999999'])('ignores truck=%j', (value) => {
    expect(parse(`?truck=${value}`).truckId).toBeNull()
  })
})
