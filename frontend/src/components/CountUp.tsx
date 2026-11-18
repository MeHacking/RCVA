import { useEffect, useRef, useState } from 'react'
import { countUpValue } from './countUpModel'

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A number that counts up from zero when it appears (and on to a new value when it changes),
 * shown through `format`; at once with "reduce motion". `delayMs` waits for the card to rise in.
 */
export function CountUp({
  value,
  format = String,
  delayMs = 0,
}: {
  value: number
  format?: (value: number) => string
  delayMs?: number
}) {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0))
  const current = useRef(shown)

  useEffect(() => {
    const from = current.current
    if (from === value) return
    if (reducedMotion()) {
      current.current = value
      setShown(value)
      return
    }
    const startAt = performance.now() + delayMs
    let frame = requestAnimationFrame(function step(now) {
      const next = countUpValue(from, value, now - startAt)
      current.current = next
      setShown(next)
      if (next !== value) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, delayMs])

  return <>{format(shown)}</>
}
