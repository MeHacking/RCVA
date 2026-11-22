// Icons whose parts move on hover, as in smartLoad+ (motionIcons.tsx; owner, 22.11.2026), drawn
// with the same paths as Lucide's Trash2 and Pencil (ISC licence), so they look the same at rest:
// - TrashIcon: the lid (and its handle) opens, hinged at its right end;
// - PencilIcon: the pencil writes a little, a short scribble along the line.
// The motion itself is in components.css (.trash-icon, .pencil-icon).
import type { ReactNode } from 'react'

function Svg({ size = 16, base, children }: { size?: number; base: string; children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function TrashIcon({ size }: { size?: number }) {
  return (
    <Svg size={size} base="trash-icon">
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <g className="trash-icon__lid">
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </g>
    </Svg>
  )
}

export function PencilIcon({ size }: { size?: number }) {
  return (
    <Svg size={size} base="pencil-icon">
      <g className="pencil-icon__body">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
        <path d="m15 5 4 4" />
      </g>
    </Svg>
  )
}
