import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TopBarTitleContext } from '../app/topBarTitle'

/**
 * A screen's title and its controls. As in smartLoad+'s top bar (owner, 21.11.2026), they go into
 * the top bar: the title with `note` after it (what the screen is for), then `tools` (a search)
 * and `actions` (glass buttons, class "btn btn--glass") at the right. Where the top bar has no
 * place for them (the steps of Optimizacija), the title is hidden and the rest stays on the page.
 *
 * `context`: e.g. "Korak 1 od 4" in Optimizacija (as smartLoad+'s ScreenHeader).
 */
export function PageHeader({
  title,
  actions,
  context,
  note,
  tools,
}: {
  title: string
  actions?: ReactNode
  context?: string
  note?: string
  tools?: ReactNode
}) {
  const place = useContext(TopBarTitleContext)
  if (place) {
    return createPortal(
      <>
        <h1 className="top-bar__heading">{title}</h1>
        {(note ?? context) && <span className="top-bar__note">{note ?? context}</span>}
        {tools && <div className="top-bar__tools">{tools}</div>}
        {actions && <div className="top-bar__actions">{actions}</div>}
      </>,
      place,
    )
  }
  // In Optimizacija the top bar shows the steps, so the step's title is only for screen readers and
  // just "Korak 1 od 4" shows, as smartLoad+'s ScreenHeader (the big title looked like a leftover
  // of the old top bar, owner 21.11.2026).
  return (
    <header className="page-header">
      <div className="page-header__titles">
        {context && <p className="page-header__context">{context}</p>}
        <h1 className="visually-hidden">{title}</h1>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}
