import { formatDate, formatDayMonth, formatMonth, formatMonthYear } from '../../format/time'

// The number of optimization jobs started per day, week or month (the dashboard's chart),
// and the smooth curve through its points.

export type ActivityPeriod = 'day' | 'week' | 'month'

/**
 * The periods of the chart, the present one last: `count` at first (trimmed to the first job,
 * fromFirstActivity), `step` more or fewer with "Proširi" / "Suzi", at most `max`, at least 2.
 */
export const ACTIVITY_PERIODS: Record<ActivityPeriod, { label: string; count: number; step: number; max: number }> = {
  day: { label: 'Dan', count: 14, step: 7, max: 90 },
  week: { label: 'Nedelja', count: 12, step: 4, max: 52 },
  month: { label: 'Mesec', count: 12, step: 4, max: 36 },
}

export const MIN_ACTIVITY_POINTS = 2

export interface ActivityPoint {
  /** local start of the period */
  start: Date
  /** short, for the axis: "3.11.", "27.10.", "nov" */
  label: string
  /** whole, for the tooltip and the table: "3.11.2026.", "nedelja od 27.10.2026.", "nov 2026" */
  title: string
  count: number
}

/** Local start of the period holding `date`; a week starts on Monday. */
export function periodStart(date: Date, period: ActivityPeriod): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), period === 'month' ? 1 : date.getDate())
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

function previous(start: Date, period: ActivityPeriod, steps: number): Date {
  if (period === 'month') return new Date(start.getFullYear(), start.getMonth() - steps, 1)
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() - steps * (period === 'week' ? 7 : 1))
}

/** Jobs started per period, for the last `count` periods up to `now`. */
export function activitySeries(
  times: string[],
  period: ActivityPeriod,
  now: Date = new Date(),
  count: number = ACTIVITY_PERIODS[period].count,
): ActivityPoint[] {
  const current = periodStart(now, period)
  const points: ActivityPoint[] = Array.from({ length: count }, (_, i) => {
    const start = previous(current, period, count - 1 - i)
    return {
      start,
      label: period === 'month' ? formatMonth(start) : formatDayMonth(start),
      title: period === 'month' ? formatMonthYear(start) : period === 'week' ? `nedelja od ${formatDate(start)}` : formatDate(start),
      count: 0,
    }
  })
  const index = new Map(points.map((p, i) => [p.start.getTime(), i]))
  for (const time of times) {
    const date = new Date(time)
    if (Number.isNaN(date.getTime())) continue
    const i = index.get(periodStart(date, period).getTime())
    if (i !== undefined) points[i].count++
  }
  return points
}

/**
 * The points from one period before the first job on (the rise from zero stays visible),
 * at least two; all of them when no job was started.
 */
export function fromFirstActivity(points: ActivityPoint[]): ActivityPoint[] {
  const first = points.findIndex((p) => p.count > 0)
  if (first < 0) return points
  return points.slice(Math.max(0, Math.min(first - 1, points.length - MIN_ACTIVITY_POINTS)))
}

/**
 * A smooth curve through the points (SVG path data), monotone between them (Fritsch–Carlson),
 * so it never swings below a zero or above a peak the data does not have.
 */
export function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`
  const n = points.length
  const dx = points.slice(1).map((p, i) => p[0] - points[i][0])
  const slope = points.slice(1).map((p, i) => (p[1] - points[i][1]) / dx[i])
  const tangent = points.map((_, i) => {
    if (i === 0) return slope[0]
    if (i === n - 1) return slope[n - 2]
    // Flat where the curve turns, so it does not overshoot.
    return slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  })
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0
      tangent[i + 1] = 0
      continue
    }
    const a = tangent[i] / slope[i]
    const b = tangent[i + 1] / slope[i]
    const h = a * a + b * b
    if (h > 9) {
      const t = 3 / Math.sqrt(h)
      tangent[i] = t * a * slope[i]
      tangent[i + 1] = t * b * slope[i]
    }
  }
  const round = (v: number) => Math.round(v * 100) / 100
  let d = `M${round(points[0][0])},${round(points[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const h = dx[i] / 3
    d += ` C${round(x0 + h)},${round(y0 + tangent[i] * h)} ${round(x1 - h)},${round(y1 - tangent[i + 1] * h)} ${round(x1)},${round(y1)}`
  }
  return d
}
