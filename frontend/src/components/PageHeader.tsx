import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TopBarTitleContext } from '../app/topBarTitle'

/**
 * A screen's title and its buttons. The title goes into the top bar, as in smartLoad+ (owner,
 * 21.11.2026), with `context` after it as a note; the buttons stay on the page. Where the top bar
 * has no place for it (the steps of Optimizacija), all of it stays on the page.
 *
 * `context`: e.g. "Korak 1 od 4" in Optimizacija (as smartLoad+'s ScreenHeader).
 */
export function PageHeader({ title, actions, context }: { title: string; actions?: ReactNode; context?: string }) {
  const place = useContext(TopBarTitleContext)
  if (place) {
    return (
      <>
        {createPortal(
          <>
            <h1 className="top-bar__heading">{title}</h1>
            {context && <span className="top-bar__note">{context}</span>}
          </>,
          place,
        )}
        {actions && (
          <div className="page-header page-header--actions">
            <div className="page-header__actions">{actions}</div>
          </div>
        )}
      </>
    )
  }
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
