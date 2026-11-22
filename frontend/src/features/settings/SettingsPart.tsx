import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'

/** Ref callback for a part, by its id in the contents (useScrollSpy). */
export type PartRef = (id: string) => (el: HTMLElement | null) => void

/**
 * One part of the settings as a card, as in smartLoad+ (owner, 22.11.2026): its title with the
 * icon it has in the contents and what it does under it, then its fields or buttons (see
 * .settings-part in components.css).
 */
export function SettingsPart({
  id,
  icon: Glyph,
  title,
  about,
  partRef,
  className,
  children,
}: {
  /** the part's id in the contents */
  id: string
  icon: LucideIcon
  title: string
  about: ReactNode
  partRef: PartRef
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section
      className={`panel settings-part${className ? ` ${className}` : ''}`}
      ref={partRef(id)}
      aria-labelledby={titleId}
    >
      <div className="settings-part__head">
        <h2 id={titleId}>
          <Glyph aria-hidden="true" />
          {title}
        </h2>
        {about}
      </div>
      <div className="settings-part__fields">{children}</div>
    </section>
  )
}
