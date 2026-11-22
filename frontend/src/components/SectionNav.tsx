import type { LucideIcon } from 'lucide-react'

// The contents beside a screen's parts ("Sadržaj"): a list that stays in view and marks the part
// being read (hooks/useScrollSpy.ts); a click scrolls to that part. Taken from smartLoad+
// (sectionNav.tsx), as the owner asked for its look on Podešavanja and Uputstvo (22.11.2026). On a
// narrow page it is a row of chips above the parts (.section-layout in layout.css).

export interface NavPart {
  id: string
  title: string
  icon: LucideIcon
}

export function SectionNav({
  parts,
  active,
  goTo,
  label,
}: {
  parts: NavPart[]
  active: string
  goTo: (id: string) => void
  label: string
}) {
  return (
    <nav className="panel section-nav" aria-label={label}>
      <p className="section-nav__title">Sadržaj</p>
      <ul>
        {parts.map(({ id, title, icon: Glyph }) => (
          <li key={id}>
            <button
              type="button"
              className="section-nav__item"
              aria-current={active === id ? 'true' : undefined}
              onClick={() => goTo(id)}
            >
              <Glyph aria-hidden="true" />
              <span>{title}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
