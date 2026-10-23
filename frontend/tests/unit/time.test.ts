import { describe, expect, it } from 'vitest'
import { formatTime } from '../../src/format/time'

describe('formatTime', () => {
  it('shows local time as HH:MM:SS', () => {
    const iso = new Date(2026, 9, 23, 9, 5, 7).toISOString()
    expect(formatTime(iso)).toBe('09:05:07')
  })

  it.each([null, '', 'not a date'])('returns a dash for %j', (value) => {
    expect(formatTime(value)).toBe('–')
  })
})
