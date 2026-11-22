import { Plus } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { apiMode, apiModeLabel } from '../api/apiMode'
import { BackgroundWaves } from '../components/BackgroundWaves'
import { BrandLogo } from '../components/BrandLogo'
import { Icon } from '../components/Icon'
import { AccountTray } from './AccountTray'
import { NAV_ITEMS } from './navItems'
import { PATHS } from './paths'
import { TopBar } from './TopBar'
import { TopBarTitleContext } from './topBarTitle'
import { RESULTS_PATH, useJobNotices } from './useJobNotices'

/*
 * The shell as in smartLoad+ (owner, 20.11.2026): a floating frosted menu on the left, and above
 * the page two dark bars that stay at the top, the job's (status and "Pokreni optimizaciju") and
 * a small one with the notifications and the user.
 */
export function AppLayout() {
  const navigate = useNavigate()
  const notices = useJobNotices()
  // The place for the screen's title in the top bar (PageHeader puts it there).
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  return (
    <div className="app">
      <BackgroundWaves />
      <nav className="app__nav" aria-label="Glavna navigacija">
        <div className="brand">
          <BrandLogo />
          <span className="brand__name">
            RCVA
            <span className="brand__tagline">Rutiranje i Vizualizacija</span>
          </span>
        </div>
        <div className="app__nav-scroll">
          <NavList />
        </div>
        {/* As in smartLoad+ (owner, 21.11.2026): a new optimization starts at its first step. The
            shipments and trucks are kept data in RCVA, so there is no draft to throw away. */}
        <button type="button" className="button--primary nav-new" onClick={() => void navigate(PATHS.shipments)}>
          <Plus aria-hidden="true" size={18} />
          Nova optimizacija
        </button>
        <div className="nav-footer">
          <span className="nav-footer__chip">
            {/* Where the data is: this computer (on the device, or the sample data in the browser), or the server. */}
            <Icon name={apiMode() === 'server' ? 'server' : 'monitor'} size={15} />
            <span data-testid="data-source">{apiModeLabel(apiMode())}</span>
          </span>
        </div>
      </nav>
      <div className="app__workspace">
        <div className="app__top">
          {/* The page's own background over the strip above the bars, so no card shows there
              while the page scrolls (as in smartLoad+): the same fixed waves, cut to that strip. */}
          <div className="app__top-cover" aria-hidden="true">
            <BackgroundWaves />
          </div>
          <header className="bar">
            <TopBar titleRef={setTitleSlot} />
          </header>
          <div className="bar bar--tray">
            <AccountTray
              notices={notices}
              openNotice={() => void navigate(RESULTS_PATH)}
              openSettings={apiMode() === 'local' ? () => void navigate('/settings') : null}
            />
          </div>
        </div>
        <main className="app__main">
          <TopBarTitleContext value={titleSlot}>
            <Outlet />
          </TopBarTitleContext>
        </main>
      </div>
    </div>
  )
}

/**
 * The screens, with a highlight under the open one that glides to the next one when the
 * screen changes (it is placed on the active link after each change; the first time without
 * gliding, so it does not fly in from the top).
 */
function NavList() {
  const list = useRef<HTMLUListElement>(null)
  const { pathname } = useLocation()
  const [mark, setMark] = useState<{ top: number; height: number; glide: boolean } | null>(null)

  useLayoutEffect(() => {
    const box = list.current
    const active = box?.querySelector<HTMLElement>('.nav-link.active')
    // Measured on the screen, not by offsetTop: while the items slide in (a transform on each), an
    // item, not the list, is the link's offset parent.
    const next =
      box && active
        ? { top: active.getBoundingClientRect().top - box.getBoundingClientRect().top, height: active.offsetHeight }
        : null
    setMark((before) => (next ? { ...next, glide: before !== null } : null))
  }, [pathname])

  return (
    <ul ref={list} className="nav-list">
      {mark && (
        <li
          className={`nav-mark${mark.glide ? ' nav-mark--glide' : ''}`}
          style={{ transform: `translateY(${mark.top}px)`, height: mark.height }}
          aria-hidden="true"
        />
      )}
      {NAV_ITEMS.map(({ to, label, icon: Glyph }) => (
        <li key={to}>
          {/* viewTransition: the old screen sinks away as the new one comes (layout.css). */}
          <NavLink to={to} end={to === '/'} className="nav-link" viewTransition>
            <span className="nav-link__icon">
              <Glyph aria-hidden="true" size={20} />
            </span>
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
