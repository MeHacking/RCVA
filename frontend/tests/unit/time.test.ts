import { describe, expect, it } from 'vitest'
import { formatDateTime, formatTime } from '../../src/format/time'

describe('formatTime', () => {
  it('shows local time as HH:MM:SS', () => {
    const iso = new Date(2026, 9, 23, 9, 5, 7).toISOString()
    expect(formatTime(iso)).toBe('09:05:07')
  })

  it.each([null, '', 'not a date'])('returns a dash for %j', (value) => {
    expect(formatTime(value)).toBe('–')
  })
})

describe('formatDateTime', () => {
  it('shows the local date and time as DD.MM.GGGG. HH:MM', () => {
    expect(formatDateTime(new Date(2026, 10, 1, 9, 5, 7).toISOString())).toBe('01.11.2026. 09:05')
  })

  it.each([null, '', 'not a date'])('returns a dash for %j', (value) => {
    expect(formatDateTime(value)).toBe('–')
  })
})
