import { describe, expect, it } from 'vitest'
import { ACTIVITY_PERIODS, activitySeries, fromFirstActivity, periodStart, smoothPath } from '../../src/features/dashboard/activityModel'

// Local times, as the dashboard counts them (a job at 23:30 belongs to its own local day).
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString()
const NOW = new Date(2026, 10, 4, 15) // Wednesday 4.11.2026.

describe('jobs started per period', () => {
  it('counts per day for the last 14 days, today last', () => {
    const series = activitySeries([at(2026, 11, 4, 9), at(2026, 11, 4, 23), at(2026, 11, 3), at(2026, 10, 22), at(2026, 10, 21)], 'day', NOW)
    expect(series).toHaveLength(ACTIVITY_PERIODS.day.count)
    expect(series.at(-1)).toMatchObject({ label: '4.11.', title: '4.11.2026.', count: 2 })
    expect(series.at(-2)).toMatchObject({ label: '3.11.', count: 1 })
    expect(series[0]).toMatchObject({ label: '22.10.', count: 1 })
    // 21.10. is before the first of the 14 days.
    expect(series.reduce((sum, p) => sum + p.count, 0)).toBe(4)
  })

  it('counts per week from Monday, for the last 12 weeks', () => {
    expect(periodStart(NOW, 'week')).toEqual(new Date(2026, 10, 2))
    // Sunday 1.11. belongs to the week before.
    const series = activitySeries([at(2026, 11, 2), at(2026, 11, 1), at(2026, 10, 26)], 'week', NOW)
    expect(series).toHaveLength(12)
    expect(series.at(-1)).toMatchObject({ label: '2.11.', title: 'nedelja od 2.11.2026.', count: 1 })
    expect(series.at(-2)).toMatchObject({ label: '26.10.', count: 2 })
  })

  it('counts per month for the last 12 months, across the year', () => {
    const series = activitySeries([at(2026, 11, 1), at(2025, 12, 31), at(2025, 12, 1), at(2025, 11, 30)], 'month', NOW)
    expect(series.map((p) => p.label)).toEqual(['dec', 'jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov'])
    expect(series[0]).toMatchObject({ title: 'dec 2025', count: 2 })
    expect(series.at(-1)).toMatchObject({ title: 'nov 2026', count: 1 })
  })

  it('leaves out a bad time and a time after now', () => {
    expect(activitySeries(['nije datum', at(2026, 11, 5)], 'day', NOW).every((p) => p.count === 0)).toBe(true)
  })
})

describe('fewer points before the first job', () => {
  const counts = (values: number[]) => values.map((count, i) => ({ start: new Date(2026, 0, i + 1), label: '', title: '', count }))

  it('starts one period before the first job, with at least two points', () => {
    expect(fromFirstActivity(counts([0, 0, 0, 2, 0, 1])).map((p) => p.count)).toEqual([0, 2, 0, 1])
    expect(fromFirstActivity(counts([3, 0, 1])).map((p) => p.count)).toEqual([3, 0, 1])
    expect(fromFirstActivity(counts([0, 0, 0, 0, 5])).map((p) => p.count)).toEqual([0, 5])
    expect(fromFirstActivity(counts([0, 0, 0, 0, 0])).map((p) => p.count)).toHaveLength(5)
  })
})

describe('smooth curve', () => {
  /** The y of every point a cubic Bézier passes, sampled. */
  function sampledYs(d: string): number[] {
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    const ys: number[] = []
    let [x0, y0] = numbers.slice(0, 2)
    for (let i = 2; i + 5 < numbers.length + 1; i += 6) {
      const [, c1y, , c2y, x1, y1] = numbers.slice(i, i + 6)
      for (let t = 0; t <= 1; t += 0.05) {
        const u = 1 - t
        ys.push(u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1)
      }
      ;[x0, y0] = [x1, y1]
    }
    void x0
    return ys
  }

  it('passes every point and never goes past the lowest or highest one (SVG y grows downwards)', () => {
    const points: Array<[number, number]> = [
      [0, 100],
      [10, 100],
      [20, 20],
      [30, 100],
      [40, 60],
    ]
    const d = smoothPath(points)
    expect(d.startsWith('M0,100 C')).toBe(true)
    expect(d.endsWith(' 40,60')).toBe(true)
    const ys = sampledYs(d)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100 + 1e-9)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(20 - 1e-9)
  })

  it('draws one point as a single move and a flat series as a flat line', () => {
    expect(smoothPath([[5, 7]])).toBe('M5,7')
    expect(smoothPath([])).toBe('')
    expect(sampledYs(smoothPath([[0, 50], [10, 50], [20, 50]])).every((y) => Math.abs(y - 50) < 1e-9)).toBe(true)
  })
})
