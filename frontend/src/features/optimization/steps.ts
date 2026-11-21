import { ClipboardCheck, Package, Timer, Truck, type LucideIcon } from 'lucide-react'
import { PATHS } from '../../app/paths'

/*
 * Optimizacija (user, 21.11.2026, as in smartLoad+): one menu item, four steps filled in one after
 * another: the shipments (from Excel or one by one), where the trucks are, the time limit, and the
 * result. Every step is a screen with its own address, so a reload or the back button keeps the place.
 */
export const STEPS: ReadonlyArray<{ to: string; label: string; icon: LucideIcon }> = [
  { to: PATHS.shipments, label: 'Pošiljke', icon: Package },
  { to: PATHS.truckLocations, label: 'Lokacije kamiona', icon: Truck },
  { to: PATHS.time, label: 'Vreme', icon: Timer },
  { to: PATHS.result, label: 'Rezultat', icon: ClipboardCheck },
]

/** "Korak 2 od 4" for the step at that address. */
export function stepContext(to: string): string {
  return `Korak ${STEPS.findIndex((s) => s.to === to) + 1} od ${STEPS.length}`
}

/** The step an address belongs to (also its sub-pages: the import, the result's views). */
export function stepAt(pathname: string): (typeof STEPS)[number] | undefined {
  return STEPS.find((s) => pathname === s.to || pathname.startsWith(`${s.to}/`))
}

export const LAST_STEP_KEY = 'rcva.optimizationStep'

/** A truck's location was set or kept: the step "Lokacije kamiona" counts again. */
const TRUCK_STARTS_CHANGED = 'rcva:truck-starts-changed'

export function announceTruckStarts(): void {
  window.dispatchEvent(new Event(TRUCK_STARTS_CHANGED))
}

export function onTruckStarts(listener: () => void): () => void {
  window.addEventListener(TRUCK_STARTS_CHANGED, listener)
  return () => window.removeEventListener(TRUCK_STARTS_CHANGED, listener)
}
