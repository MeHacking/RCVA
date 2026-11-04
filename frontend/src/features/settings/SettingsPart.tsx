import { useId, type ReactNode } from 'react'

/**
 * One numbered part of the settings: its number and title with what it does on the left, its
 * fields or buttons on the right (see .settings-part in components.css).
 */
export function SettingsPart({
  n,
  title,
  about,
  children,
}: {
  n: number
  title: string
  about: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className="settings-part" aria-labelledby={id}>
      <div className="settings-part__about">
        <h2 id={id}>
          <span className="number-badge">
            {n}
            <span className="visually-hidden">. </span>
          </span>
          {title}
        </h2>
        {about}
      </div>
      <div className="settings-part__fields">{children}</div>
    </section>
  )
}
