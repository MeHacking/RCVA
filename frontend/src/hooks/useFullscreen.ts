import { useEffect, useState, type RefObject } from 'react'

/**
 * Full screen for one element (the route map, the 3D view): the browser's own (Esc leaves it),
 * or, where there is none (some phones) or it is refused, `expanded`: the caller spreads the
 * element over the whole page, and Esc closes it as well.
 */
export function useFullscreen(element: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement !== null && document.fullscreenElement === element.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [element])

  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  async function toggle() {
    const current = element.current
    if (!current) return
    if (document.fullscreenElement) return document.exitFullscreen()
    if (expanded) return setExpanded(false)
    if (document.fullscreenEnabled) {
      try {
        return await current.requestFullscreen()
      } catch {
        // refused (e.g. not from a click): spread over the page instead
      }
    }
    setExpanded(true)
  }

  return { full: native || expanded, expanded, toggle }
}
