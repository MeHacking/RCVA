import { NavLink, Outlet } from 'react-router'
import { TopBar } from './TopBar'

const NAV_ITEMS = [
  { to: '/', label: 'Pregled' },
  { to: '/shipments', label: 'Pošiljke' },
  { to: '/trucks', label: 'Kamioni' },
  { to: '/optimization', label: 'Rezultati optimizacije' },
  { to: '/truck-3d', label: '3D prikaz kamiona' },
  { to: '/route-map', label: 'Mapa ruta' },
] as const

export function AppLayout() {
  return (
    <div className="app">
      <nav className="app__nav" aria-label="Glavna navigacija">
        <div className="app__brand">RCVA</div>
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
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
