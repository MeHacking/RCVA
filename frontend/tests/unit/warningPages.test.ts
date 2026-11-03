import { describe, expect, it } from 'vitest'
import { pagesThatFit } from '../../src/features/dashboard/warningPages'

describe('pages of warnings', () => {
  // Items of 30, 30, 60 and 30 px with 10 px between them.
  const tops = [0, 40, 80, 150]
  const bottoms = [30, 70, 140, 180]

  it('puts on each page what fits the room, gaps included', () => {
    expect(pagesThatFit(tops, bottoms, 70)).toEqual([[0, 1], [2], [3]])
    expect(pagesThatFit(tops, bottoms, 100)).toEqual([[0, 1], [2, 3]])
    expect(pagesThatFit(tops, bottoms, 200)).toEqual([[0, 1, 2, 3]])
  })

  it('gives an item taller than the room a page of its own', () => {
    expect(pagesThatFit(tops, bottoms, 40)).toEqual([[0], [1], [2], [3]])
    expect(pagesThatFit([], [], 40)).toEqual([])
  })
})
