import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import type { DashboardModel } from './dashboardModel'
import { pagesThatFit } from './warningPages'

/** Room for the page buttons, kept free when the warnings do not fit on one page. */
const PAGER_PX = 40

/**
 * The dashboard's warnings. Next to the last job (two columns) the card only fills the room
 * the chart leaves; what does not fit goes to the next page. In one column every warning shows.
 */
export function WarningsPanel({ model }: { model: DashboardModel }) {
  const viewport = useRef<HTMLDivElement>(null)
  const measure = useRef<HTMLUListElement>(null)
  const [pages, setPages] = useState<number[][] | null>(null)
  const [page, setPage] = useState(0)
  const warnings = model.warnings

  useLayoutEffect(() => {
    const box = viewport.current
    const list = measure.current
    if (!box || !list) return
    const update = () => {
      // The card is held to the room under the chart only in two columns (see layout.css).
      const held = getComputedStyle(box.closest('.dashboard-warnings-panel') as Element).contain.includes('size')
      if (!held) return setPages(null)
      const items = [...list.children] as HTMLElement[]
      const tops = items.map((item) => item.offsetTop)
      const bottoms = items.map((item) => item.offsetTop + item.offsetHeight)
      // The room with no page buttons: they take PAGER_PX of it when they show.
      const room = box.clientHeight + (box.parentElement?.querySelector('.dashboard-warnings__pager') ? PAGER_PX : 0)
      const whole = bottoms.length === 0 || bottoms[bottoms.length - 1] <= room
      const next = whole ? null : pagesThatFit(tops, bottoms, room - PAGER_PX)
      // Unchanged pages keep the same state, so showing the buttons does not measure in a loop.
      setPages((before) => (JSON.stringify(before) === JSON.stringify(next) ? before : next))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(box)
    return () => observer.disconnect()
  }, [warnings])

  const shown = pages ? (pages[Math.min(page, pages.length - 1)] ?? []).map((i) => warnings[i]) : warnings
  const current = pages ? Math.min(page, pages.length - 1) : 0
  const list = (items: DashboardModel['warnings']) =>
    items.map((warning) => (
      <li key={warning.text} className={`dashboard-warnings__item dashboard-warnings__item--${warning.tone}`}>
        <Icon name="alert" />
        <span>
          {warning.text} <Link to={warning.link.to}>{warning.link.label}</Link>
        </span>
      </li>
    ))

  return (
    <section className="panel dashboard-panel dashboard-warnings-panel" aria-labelledby="dashboard-warnings">
      <h2 id="dashboard-warnings">Upozorenja</h2>
      <div ref={viewport} className="dashboard-warnings__viewport">
        {warnings.length === 0 ? (
          <p className="dashboard-panel__line text--muted">
            <Icon name="check" /> Nema upozorenja za trenutne pošiljke i kamione.
          </p>
        ) : (
          <ul className="dashboard-warnings">{list(shown)}</ul>
        )}
        {/* Every warning, unseen, to measure where each one ends at the card's width. */}
        <ul ref={measure} className="dashboard-warnings dashboard-warnings__measure" aria-hidden="true">
          {list(warnings)}
        </ul>
      </div>
      {pages && pages.length > 1 && (
        <div className="dashboard-warnings__pager">
          <button type="button" className="button--small" onClick={() => setPage(current - 1)} disabled={current === 0}>
            ‹ Prethodna
          </button>
          <span className="text--muted" aria-live="polite">
            Strana {current + 1} od {pages.length}
          </span>
          <button
            type="button"
            className="button--small"
            onClick={() => setPage(current + 1)}
            disabled={current === pages.length - 1}
          >
            Sledeća ›
          </button>
        </div>
      )}
      <p className="text--muted dashboard-panel__note">
        Crvena upozorenja su provere koje dokazuju da rešenje ne postoji (uz pretpostavku dve faze po ruti).
      </p>
    </section>
  )
}
