import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { spokenTime } from './timeLimit'

/*
 * "Trajanje" as a stopwatch, from smartLoad+ (timer.tsx, the same owner; user, 21.11.2026: the
 * step "Vreme" as there). One turn of the knob is 60 seconds from 12 o'clock; past 12 clockwise
 * adds a minute, back past 12 takes one away. The thin inner arc shows the whole minutes (out of
 * 10). Tied to the number field next to it: both change the same value. Colours in layout.css.
 */

const C = 110
const R = 88

function at(deg: number, radius = R): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)]
}

/** An arc clockwise from 12 o'clock to `deg` (0 < deg < 360). */
function arc(deg: number, radius = R): string {
  const [x1, y1] = at(0, radius)
  const [x2, y2] = at(deg, radius)
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${deg > 180 ? 1 : 0} 1 ${x2} ${y2}`
}

export function TimerDial(props: { seconds: number; onChange: (seconds: number) => void; min?: number; max?: number; label: string }) {
  const min = props.min ?? 1
  const max = props.max ?? 600
  const valid = Number.isFinite(props.seconds)
  const value = valid ? props.seconds : 0
  const shown = Math.min(Math.max(value, 0), max)
  const minutes = Math.floor(shown / 60)
  const secs = shown % 60
  const deg = secs * 6
  const svg = useRef<SVGSVGElement>(null)
  // While dragging: the minute we are in and the last second, to notice a pass over 12.
  const drag = useRef<{ minutes: number; last: number } | null>(null)

  const clamp = (n: number) => Math.min(Math.max(Math.round(n), min), max)

  const secondAt = (e: PointerEvent): number => {
    const box = svg.current!.getBoundingClientRect()
    const x = e.clientX - (box.left + box.width / 2)
    const y = e.clientY - (box.top + box.height / 2)
    const d = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360
    return Math.round(d / 6) % 60
  }

  const down = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const s = secondAt(e)
    drag.current = { minutes, last: s }
    props.onChange(clamp(minutes * 60 + s))
  }

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const s = secondAt(e)
    // The dial stops at the minimum and does not wrap back to 59 s: going back past 12 in the
    // first minute puts us in minute -1, where every position means the minimum, until the knob
    // comes forward past 12 again. The top end stops the same way at the maximum.
    if (d.last >= 45 && s < 15) d.minutes = Math.min(d.minutes + 1, Math.floor(max / 60))
    else if (d.last < 15 && s >= 45) d.minutes = Math.max(d.minutes - 1, -1)
    d.last = s
    props.onChange(clamp(d.minutes * 60 + s))
  }

  const up = () => {
    drag.current = null
  }

  const key = (e: KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }
    if (e.key in steps) props.onChange(clamp(value + steps[e.key]))
    else if (e.key === 'Home') props.onChange(min)
    else if (e.key === 'End') props.onChange(max)
    else return
    e.preventDefault()
  }

  const [kx, ky] = at(deg)
  const ticks = Array.from({ length: 60 }, (_, i) => i)
  const totalMinutes = Math.floor(max / 60)
  return (
    <div
      className="timer"
      role="slider"
      tabIndex={0}
      aria-label={props.label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={valid ? value : undefined}
      aria-valuetext={spokenTime(props.seconds)}
      onKeyDown={key}
    >
      <svg ref={svg} viewBox="0 0 220 220" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {ticks.map((i) => {
          const major = i % 5 === 0
          const [x1, y1] = at(i * 6, 72)
          const [x2, y2] = at(i * 6, major ? 63 : 67)
          return <line key={i} className={`timer__tick${major ? ' timer__tick--major' : ''}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        })}
        {[0, 15, 30, 45].map((s) => {
          const [x, y] = at(s * 6, 52)
          return (
            <text key={s} className="timer__num" x={x} y={y}>
              {s}
            </text>
          )
        })}
        <circle className="timer__track" cx={C} cy={C} r={R} />
        {secs > 0 && <path className="timer__fill" d={arc(deg)} />}
        {/* Whole minutes, as a thin inner ring out of 10. */}
        <circle className="timer__minutes-track" cx={C} cy={C} r={100} />
        {minutes > 0 &&
          (minutes >= totalMinutes ? (
            <circle className="timer__minutes" cx={C} cy={C} r={100} />
          ) : (
            <path className="timer__minutes" d={arc((minutes / totalMinutes) * 360, 100)} />
          ))}
        <circle className="timer__knob" cx={kx} cy={ky} r={10} />
      </svg>
      <div className="timer__text" aria-hidden="true">
        <strong>{valid ? `${minutes}:${String(secs).padStart(2, '0')}` : '–'}</strong>
        <small>{valid && minutes > 0 ? `${minutes} min ${secs} s` : 'min : s'}</small>
      </div>
    </div>
  )
}
