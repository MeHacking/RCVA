import { afterEach, describe, expect, it } from 'vitest'
import { recommendedTimeLimit, saveTimeLimit, storedTimeLimit, topBarTimeLimit } from '../../src/features/optimization/timeLimit'

// localStorage in the node environment of the unit tests.
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  configurable: true,
})

describe('the recommended time limit (measured 21.11.2026)', () => {
  afterEach(() => store.clear())

  it('grows with the number of shipments', () => {
    expect([1, 10, 11, 30, 31, 50, 51, 75, 76, 120].map(recommendedTimeLimit)).toEqual([10, 10, 20, 20, 40, 40, 120, 120, 180, 180])
  })

  it('is used by the top bar until a longer time is chosen, never a shorter one', () => {
    expect(storedTimeLimit()).toBeNull()
    expect(topBarTimeLimit(28)).toBe(20)
    saveTimeLimit(5)
    expect(storedTimeLimit()).toBe(5)
    expect(topBarTimeLimit(28)).toBe(20)
    saveTimeLimit(90)
    expect(topBarTimeLimit(28)).toBe(90)
  })
})
