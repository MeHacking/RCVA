import { describe, expect, it } from 'vitest'
import { COUNT_UP_MS, countUpValue } from '../../src/components/countUpModel'

describe('countUpValue', () => {
  it('starts at the start and ends exactly at the value', () => {
    expect(countUpValue(0, 209, 0)).toBe(0)
    expect(countUpValue(0, 209, COUNT_UP_MS)).toBe(209)
    expect(countUpValue(0, 209, COUNT_UP_MS * 3)).toBe(209)
    // A value that is not whole is never rounded at the end.
    expect(countUpValue(0, 1234.5, COUNT_UP_MS)).toBe(1234.5)
  })

  it('waits before the delay (negative time is the start)', () => {
    expect(countUpValue(5, 100, -200)).toBe(5)
  })

  it('shows whole numbers on the way, rising and slowing down', () => {
    const steps = [0.1, 0.25, 0.5, 0.75, 0.9].map((t) => countUpValue(0, 1000, t * COUNT_UP_MS))
    for (const step of steps) expect(Number.isInteger(step)).toBe(true)
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1])
    // Eased out: past halfway by a quarter of the time.
    expect(steps[1]).toBeGreaterThan(500)
  })

  it('counts down as well', () => {
    expect(countUpValue(100, 40, COUNT_UP_MS / 2)).toBeLessThan(100)
    expect(countUpValue(100, 40, COUNT_UP_MS / 2)).toBeGreaterThan(40)
    expect(countUpValue(100, 40, COUNT_UP_MS)).toBe(40)
  })
})
