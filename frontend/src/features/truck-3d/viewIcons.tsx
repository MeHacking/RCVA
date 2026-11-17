import type { ViewName } from './scene'

// Icons for the 3D views, taken over from smartLoad (editor/viewIcons.tsx): the same box (the
// cargo space) in each, an arrow from where the camera looks, and the side that is seen shaded.
// Drawn like the icons in components/Icon.tsx (24 px grid, round strokes, currentColor).

/** The box: long front face, top and right (rear) face. */
const BOX = 'M4 12h11v6H4z M4 12l3-3h11l-3 3 M15 18l3-3V9'

const ICONS: Record<ViewName, { arrow: string; seen?: string }> = {
  // from above, behind and on the left (the box's right face is the rear)
  iso: { arrow: 'M23 1 18 6 M18 2.4V6h3.6' },
  // straight down onto the top
  top: { seen: 'M4 12l3-3h11l-3 3z', arrow: 'M11 0.8V6.5 M8.2 3.8 11 6.5l2.8-2.7' },
  // at the long side
  side: { seen: 'M4 12h11v6H4z', arrow: 'M9.5 23.5V20 M6.8 22.2 9.5 19.6l2.7 2.6' },
  // in at the rear doors
  back: { seen: 'M15 12l3-3v6l-3 3z', arrow: 'M23.5 13.5H20 M21.8 10.8 19.4 13.5l2.4 2.7' },
}

export function ViewIcon({ view, size = 18 }: { view: ViewName; size?: number }) {
  const { arrow, seen } = ICONS[view]
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {seen && <path d={seen} fill="currentColor" fillOpacity={0.3} stroke="none" />}
      <path d={BOX} strokeWidth={1.5} />
      <path d={arrow} />
    </svg>
  )
}
