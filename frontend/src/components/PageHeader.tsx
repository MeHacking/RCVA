import type { ReactNode } from 'react'

/** `context`: a line above the title, e.g. "Korak 1 od 4" in Optimizacija (as smartLoad+'s ScreenHeader). */
export function PageHeader({ title, actions, context }: { title: string; actions?: ReactNode; context?: string }) {
  return (
    <header className="page-header">
      <div className="page-header__titles">
        {context && <p className="page-header__context">{context}</p>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}
