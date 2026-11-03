import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import {
  ACTIVITY_PERIODS,
  activitySeries,
  fromFirstActivity,
  MIN_ACTIVITY_POINTS,
  smoothPath,
  type ActivityPeriod,
} from './activityModel'

// Jobs started per day, week or month: a smooth line through the points, a light wash under
// it, and on hover (or with the arrow keys) a crosshair, the point and a tooltip. Drawn at the
// card's real width, so points and text keep their shape. The same figures are in a hidden
// table for assistive technology.

const HEIGHT = 200
const PAD = { top: 16, right: 16, bottom: 28, left: 32 }

const UNITS: Record<ActivityPeriod, string> = { day: 'danima', week: 'nedeljama', month: 'mesecima' }

function optimizations(n: number): string {
  const tens = n % 100
  if (n % 10 === 1 && tens !== 11) return `${n} optimizacija`
  if (n % 10 >= 2 && n % 10 <= 4 && (tens < 12 || tens > 14)) return `${n} optimizacije`
  return `${n} optimizacija`
}

/** Clean steps for the count axis: 0, 1, 2… or 0, 2, 4… or wider. */
function ticksFor(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : Math.ceil(max / 4)
  const top = Math.max(step, Math.ceil(max / step) * step)
  return Array.from({ length: top / step + 1 }, (_, i) => i * step)
}

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

export function ActivityChart({ history }: { history: string[] }) {
  const id = useId()
  const [period, setPeriod] = useState<ActivityPeriod>('day')
  const [hovered, setHovered] = useState<number | null>(null)
  /** points shown after "Proširi" / "Suzi"; null: from the period before the first job */
  const [shown, setShown] = useState<number | null>(null)
  const [frameRef, width] = useWidth<HTMLDivElement>()
  const { count, step, max } = ACTIVITY_PERIODS[period]
  const all = activitySeries(history, period, new Date(), max)
  // At first the periods before the first job are left out (one zero before it stays).
  const visible = shown ?? fromFirstActivity(all.slice(-count)).length
  const points = all.slice(-visible)
  const total = points.reduce((sum, p) => sum + p.count, 0)

  const ticks = ticksFor(Math.max(...points.map((p) => p.count)))
  const top = ticks[ticks.length - 1]
  const plotWidth = Math.max(0, width - PAD.left - PAD.right)
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * plotWidth : plotWidth / 2)
  const y = (count: number) => PAD.top + plotHeight - (count / top) * plotHeight
  const xy = points.map((p, i): [number, number] => [x(i), y(p.count)])
  const line = smoothPath(xy)
  const base = PAD.top + plotHeight
  const area = xy.length > 0 ? `${line} L${xy[xy.length - 1][0]},${base} L${xy[0][0]},${base} Z` : ''
  // Every label needs about 3.5rem; the rest stay in the tooltip and the table.
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotWidth / 56))))

  function pointAt(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const step = points.length > 1 ? plotWidth / (points.length - 1) : 1
    setHovered(Math.min(points.length - 1, Math.max(0, Math.round((event.clientX - box.left) / step))))
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const from = hovered ?? points.length - 1
    setHovered(Math.min(points.length - 1, Math.max(0, from + (event.key === 'ArrowRight' ? 1 : -1))))
  }

  const active = hovered === null ? null : points[hovered]
  return (
    <div className="activity">
      <div className="activity__head">
        <p className="text--muted">
          Ukupno u prikazanom periodu: <strong>{optimizations(total)}</strong>
        </p>
        <div className="segmented" role="group" aria-label="Period">
          {(Object.keys(ACTIVITY_PERIODS) as ActivityPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              className="segmented__option"
              aria-pressed={p === period}
              onClick={() => {
                setPeriod(p)
                setShown(null)
                setHovered(null)
              }}
            >
              {ACTIVITY_PERIODS[p].label}
            </button>
          ))}
        </div>
        <div className="activity__range">
          <button
            type="button"
            className="button--small"
            onClick={() => {
              setShown(Math.max(MIN_ACTIVITY_POINTS, visible - step))
              setHovered(null)
            }}
            disabled={visible <= MIN_ACTIVITY_POINTS}
            aria-label="Suzi grafik: manje prethodnih tačaka"
          >
            Suzi
          </button>
          <button
            type="button"
            className="button--small"
            onClick={() => {
              setShown(Math.min(max, visible + step))
              setHovered(null)
            }}
            disabled={visible >= max}
            aria-label="Proširi grafik: više prethodnih tačaka"
          >
            Proširi
          </button>
        </div>
      </div>
      <div
        ref={frameRef}
        className="activity__frame"
        tabIndex={0}
        role="group"
        aria-label={`Pokrenute optimizacije po ${UNITS[period]}, poslednjih ${points.length}; strelicama levo i desno birate tačku`}
        aria-describedby={`${id}-table`}
        onKeyDown={onKey}
        onFocus={() => setHovered((h) => h ?? points.length - 1)}
        onBlur={() => setHovered(null)}
      >
        {width > 0 && (
          // A new period draws itself again.
          <svg key={period} className="activity__chart" width={width} height={HEIGHT} aria-hidden="true">
            {ticks.map((t) => (
              <g key={t}>
                <line className="activity__grid" x1={PAD.left} x2={PAD.left + plotWidth} y1={y(t)} y2={y(t)} />
                <text className="activity__tick" x={PAD.left - 8} y={y(t)}>
                  {t}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % labelEvery === (points.length - 1) % labelEvery ? (
                <text key={p.start.getTime()} className="activity__label" x={x(i)} y={HEIGHT - 8}>
                  {p.label}
                </text>
              ) : null,
            )}
            <path className="activity__area" d={area} />
            <path className="activity__line" d={line} pathLength={1} />
            {active && hovered !== null && (
              <line className="activity__crosshair" x1={x(hovered)} x2={x(hovered)} y1={PAD.top} y2={base} />
            )}
            {/* Many points: only the line, and the point under the pointer. */}
            {xy.map(([px, py], i) => (points.length > 31 && i !== hovered ? null : (
              <circle
                key={points[i].start.getTime()}
                className={`activity__point${i === hovered ? ' activity__point--active' : ''}`}
                cx={px}
                cy={py}
                r={i === hovered ? 6 : 4}
                style={{ animationDelay: `${0.5 + (i / points.length) * 0.6}s` }}
              />
            )))}
            <rect
              className="activity__hit"
              x={PAD.left}
              y={PAD.top}
              width={plotWidth}
              height={plotHeight}
              onPointerMove={pointAt}
              onPointerLeave={() => setHovered(null)}
            />
          </svg>
        )}
        {active && hovered !== null && (
          <div
            // Above the point, or below it near the top of the chart, so it never covers the controls.
            className={`activity__tooltip${y(active.count) < 64 ? ' activity__tooltip--below' : ''}`}
            role="status"
            style={{
              left: Math.min(Math.max(x(hovered), 70), width - 70),
              top: y(active.count) < 64 ? y(active.count) + 14 : y(active.count) - 12,
            }}
          >
            <strong>{optimizations(active.count)}</strong>
            <span>{active.title}</span>
          </div>
        )}
      </div>
      {total === 0 && <p className="text--muted activity__empty">U ovom periodu nije pokrenuta nijedna optimizacija.</p>}
      {/* A table ignores the 1px box of .visually-hidden and would lengthen the page; a div does not. */}
      <div className="visually-hidden">
        <table id={`${id}-table`} aria-label="Pokrenute optimizacije po periodima">
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Pokrenuto</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.start.getTime()}>
                <td>{p.title}</td>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
