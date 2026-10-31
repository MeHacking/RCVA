import { NavLink, Outlet } from 'react-router'
import { apiMode, apiModeLabel } from '../api/apiMode'
import { Icon, type IconName } from '../components/Icon'
import { TopBar } from './TopBar'

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Pregled', icon: 'dashboard' },
  { to: '/shipments', label: 'Pošiljke', icon: 'shipments' },
  { to: '/trucks', label: 'Kamioni', icon: 'truck' },
  { to: '/optimization', label: 'Rezultati optimizacije', icon: 'results' },
  { to: '/truck-3d', label: '3D prikaz kamiona', icon: 'cube' },
  { to: '/route-map', label: 'Mapa ruta', icon: 'map' },
  // Only the application on the device has settings.
  ...(apiMode() === 'local' ? [{ to: '/settings', label: 'Podešavanja', icon: 'settings' as const }] : []),
]

export function AppLayout() {
  return (
    <div className="app">
      <nav className="app__nav" aria-label="Glavna navigacija">
        <div className="brand">
          <span className="brand__mark">
            <Icon name="truck" size={16} />
          </span>
          <span className="brand__name">
            RCVA
            <span className="brand__tagline">Utovar i rute</span>
          </span>
        </div>
        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} className="nav-link">
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <p className="nav-footer" data-testid="data-source">
          {apiModeLabel(apiMode())}
        </p>
      </nav>
      <header className="app__top">
        <TopBar />
      </header>
      <main className="app__main">
        <Outlet />
      </main>
    </div>
  )
}
