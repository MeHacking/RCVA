import { useEffect, useRef, useState } from 'react'

// Which part of a screen is being read, for the contents beside it (components/SectionNav.tsx).
// Taken from smartLoad+ (sectionNav.tsx), as the owner asked for its look on Podešavanja and
// Uputstvo (22.11.2026).

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** A part counts as being read once its title has passed this line under the sticky top bar. */
export function readingLine(): number {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-height')) || 5.75
  return bar * rem + 48
}

/**
 * Which part is being read. Normally the last one whose title has passed the reading line. The
 * parts at the end can be short and the page stops before their titles get there, so over the
 * last stretch of scrolling (one screen, or less on a short page) the parts still waiting share
 * that stretch in equal slices, in order: none is skipped, and the very bottom marks the last one.
 * A clicked part stays marked while the page scrolls to it, until the user scrolls again.
 */
export function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '')
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const chosen = useRef<string | null>(null)
  const key = ids.join('|')

  useEffect(() => {
    const list = key === '' ? [] : key.split('|')
    let frame = 0
    const update = () => {
      frame = 0
      if (chosen.current || list.length === 0) return
      const y = window.scrollY
      const line = readingLine()
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      const tops = list.map((id) => {
        const el = refs.current[id]
        return el ? el.getBoundingClientRect().top + y : Number.POSITIVE_INFINITY
      })
      const reached = (scroll: number) => {
        let i = 0
        tops.forEach((t, k) => {
          if (t - scroll <= line) i = k
        })
        return i
      }
      let index = reached(y)
      const zone = Math.min(window.innerHeight, maxScroll)
      const zoneStart = maxScroll - zone
      if (zone > 0 && y > zoneStart) {
        const first = reached(zoneStart)
        const waiting = list.length - first
        const t = Math.min(1, (y - zoneStart) / zone)
        index = Math.max(index, Math.min(list.length - 1, first + Math.floor(t * waiting)))
      }
      setActive(list[index]!)
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    // The user takes over again; measured at once, since at the very bottom a wheel step scrolls
    // nothing and no scroll event would come.
    const userScrolls = () => {
      chosen.current = null
      onScroll()
    }
    // After the first paint, when the parts have their places.
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    window.addEventListener('wheel', userScrolls, { passive: true })
    window.addEventListener('touchstart', userScrolls, { passive: true })
    window.addEventListener('keydown', userScrolls)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('wheel', userScrolls)
      window.removeEventListener('touchstart', userScrolls)
      window.removeEventListener('keydown', userScrolls)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [key])

  const goTo = (id: string) => {
    chosen.current = id
    setActive(id)
    refs.current[id]?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  /** Ref callback for a part's element. */
  const partRef = (id: string) => (el: HTMLElement | null) => {
    refs.current[id] = el
  }

  return { active, goTo, partRef }
}
