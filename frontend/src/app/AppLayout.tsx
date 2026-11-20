import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { apiMode, apiModeLabel } from '../api/apiMode'
import { BackgroundWaves } from '../components/BackgroundWaves'
import { Icon, type IconName } from '../components/Icon'
import { AccountTray } from './AccountTray'
import { TopBar } from './TopBar'
import { RESULTS_PATH, useJobNotices } from './useJobNotices'

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Pregled', icon: 'dashboard' },
  { to: '/shipments', label: 'Pošiljke', icon: 'shipments' },
  { to: '/trucks', label: 'Kamioni', icon: 'truck' },
  { to: '/optimization', label: 'Rezultati optimizacije', icon: 'results' },
  { to: '/truck-3d', label: '3D prikaz kamiona', icon: 'cube' },
  { to: '/route-map', label: 'Mapa ruta', icon: 'map' },
  // Only the application on the device has settings.
  ...(apiMode() === 'local' ? [{ to: '/settings', label: 'Podešavanja', icon: 'settings' as const }] : []),
  { to: '/help', label: 'Uputstvo', icon: 'info' },
]

/*
 * The shell as in smartLoad+ (owner, 20.11.2026): a floating frosted menu on the left, and above
 * the page two dark bars that stay at the top, the job's (status and "Pokreni optimizaciju") and
 * a small one with the notifications and the user.
 */
export function AppLayout() {
  const navigate = useNavigate()
  const notices = useJobNotices()
  return (
    <div className="app">
      <BackgroundWaves />
      <nav className="app__nav" aria-label="Glavna navigacija">
        <div className="brand">
          <img className="brand__logo" src="/logo.png" alt="" width={40} height={40} />
          <span className="brand__name">
            RCVA
            <span className="brand__tagline">Rutiranje i Vizualizacija</span>
          </span>
        </div>
        <div className="app__nav-scroll">
          <NavList />
        </div>
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
            <TopBar />
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
          <Outlet />
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
      {NAV_ITEMS.map((item) => (
        <li key={item.to}>
          {/* viewTransition: the old screen sinks away as the new one comes (layout.css). */}
          <NavLink to={item.to} end={item.to === '/'} className="nav-link" viewTransition>
            <span className="nav-link__icon">
              <Icon name={item.icon} />
            </span>
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
