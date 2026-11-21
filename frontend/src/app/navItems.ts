import { BookOpen, History, House, Lightbulb, Settings, Truck, type LucideIcon } from 'lucide-react'
import { apiMode } from '../api/apiMode'
import { PATHS } from './paths'

/*
 * The icons of smartLoad+'s menu (user, 21.11.2026; lucide-react, as there): Početna (House),
 * Optimizacija (Lightbulb), Istorija (History), Katalog kamiona (Truck), Podešavanja (Settings),
 * Uputstvo (BookOpen). The order as there: the work first, then the trucks.
 */
export const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: 'Pregled', icon: House },
  // The shipments, the trucks' locations, the time limit and the result (with the map and 3D) are its steps.
  { to: PATHS.optimization, label: 'Optimizacija', icon: Lightbulb },
  { to: '/history', label: 'Istorija', icon: History },
  { to: '/trucks', label: 'Kamioni', icon: Truck },
  // Only the application on the device has settings.
  ...(apiMode() === 'local' ? [{ to: '/settings', label: 'Podešavanja', icon: Settings }] : []),
  { to: '/help', label: 'Uputstvo', icon: BookOpen },
]

/** The menu item a page belongs to (its icon goes next to the page's title in the top bar). */
export function navItemOf(pathname: string) {
  return NAV_ITEMS.find((item) => (item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`)))
}
