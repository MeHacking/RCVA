import { useCallback, useEffect, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useApi } from '../../api/apiContext'
import { PATHS } from '../../app/paths'
import { useAsyncData } from '../../hooks/useAsyncData'
import { isLastJobBusy, useLastJob } from './lastJobContext'
import { LAST_STEP_KEY, STEPS, onTruckStarts, stepAt } from './steps'

/** Optimizacija: the open step (steps.ts); the bar of steps is in the top bar (StepsBar). */
export function OptimizationLayout() {
  const { pathname } = useLocation()

  // The step last open in this tab: "Optimizacija" in the menu opens it again.
  useEffect(() => {
    const step = stepAt(pathname)
    if (!step) return
    try {
      sessionStorage.setItem(LAST_STEP_KEY, step.to)
    } catch {
      // Not kept: the menu opens the first step.
    }
  }, [pathname])

  return <Outlet />
}

/**
 * The steps of Optimizacija in the top bar, as in smartLoad+ (user, 21.11.2026: in the top bar
 * and without numbers): icon and name; "Lokacije kamiona" counts the trucks waiting for an answer,
 * "Rezultat" turns while a job runs.
 */
export function StepsBar() {
  const { pathname } = useLocation()
  const { state } = useLastJob()
  const api = useApi()
  // Asked again on every step and when a job ends (it proposes new locations).
  const jobPhase = state.kind === 'tracking' ? (state.job?.status ?? 'loading') : state.kind
  const loadWaiting = useCallback(async () => {
    void pathname
    void jobPhase
    const starts = await api.getTruckStarts()
    if (!starts) return 0
    const available = new Set((await api.listTrucks()).filter((t) => t.available).map((t) => t.id))
    return starts.filter((s) => available.has(s.truckId) && (!s.location || s.proposal)).length
  }, [api, pathname, jobPhase])
  const [waiting, reloadWaiting] = useAsyncData(loadWaiting)
  useEffect(() => onTruckStarts(reloadWaiting), [reloadWaiting])
  const busy = isLastJobBusy(state)

  return (
    <nav className="steps" aria-label="Koraci optimizacije">
      {STEPS.map(({ to, label, icon: Glyph }) => (
        <NavLink key={to} to={to} className="steps__item">
          <Glyph aria-hidden="true" size={18} />
          <span>{label}</span>
          {to === PATHS.truckLocations && waiting.status === 'success' && waiting.data > 0 && (
            <span className="steps__badge">
              {waiting.data}
              <span className="visually-hidden"> čeka odgovor</span>
            </span>
          )}
          {to === PATHS.result && busy && (
            <>
              <span className="spinner" aria-hidden="true" />
              <span className="visually-hidden"> (optimizacija radi)</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** /optimization: the step last open in this tab, or the first one. */
export function OptimizationIndex() {
  let step: string | null = null
  try {
    step = sessionStorage.getItem(LAST_STEP_KEY)
  } catch {
    step = null
  }
  const known = STEPS.find((s) => s.to === step)
  return <Navigate to={known?.to ?? PATHS.shipments} replace />
}

/** "Nazad: …" and "Dalje: …" at the end of a step; `next` replaces "Dalje" (e.g. the run button). */
export function StepNav({ at, next }: { at: string; next?: ReactNode }) {
  const i = STEPS.findIndex((s) => s.to === at)
  const before = STEPS[i - 1]
  const after = STEPS[i + 1]
  return (
    <nav className="step-nav" aria-label="Prethodni i sledeći korak">
      {before && (
        <Link className="link-button" to={before.to}>
          <ArrowLeft aria-hidden="true" size={16} />
          Nazad: {before.label.toLowerCase()}
        </Link>
      )}
      <span className="step-nav__next">
        {next ??
          (after && (
            <Link className="link-button link-button--primary" to={after.to}>
              Dalje: {after.label.toLowerCase()}
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          ))}
      </span>
    </nav>
  )
}
