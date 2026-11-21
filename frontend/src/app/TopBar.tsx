import { LoaderCircle, Play, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { apiMode } from '../api/apiMode'
import { StepsBar } from '../features/optimization/OptimizationLayout'
import { isLastJobBusy, useLastJob } from '../features/optimization/lastJobContext'
import { JobClockText } from '../features/optimization/JobClockText'
import { navItemOf } from './navItems'
import { PATHS } from './paths'

/**
 * The top bar, as in smartLoad+ (owner, 21.11.2026). In Optimizacija: its steps and "Optimizuj"
 * (while it runs "Računam…", turning into "Prekini" under the pointer). Elsewhere: the screen's
 * icon, and in `titleRef` what the screen's PageHeader puts there (title, what it is for, a
 * search, its buttons). The last job's chips were taken out: its state is in the step Rezultat
 * and the bell; a light runs along the bar while a job runs.
 */
export function TopBar({ titleRef }: { titleRef: (place: HTMLElement | null) => void }) {
  const { state, start, cancel } = useLastJob()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const busy = isLastJobBusy(state)

  // What the user must answer: the trucks' locations in their step, missing trucks in the result.
  async function startJob() {
    const kind = await start()
    if (kind === 'needsLocations') navigate(PATHS.truckLocations)
    else if (kind === 'proven') navigate(PATHS.result)
  }

  const inOptimization = pathname === PATHS.optimization || pathname.startsWith(`${PATHS.optimization}/`)
  const Glyph = navItemOf(pathname)?.icon
  // Only the application on the device can stop a job (NOT IN SPEC v2).
  const canCancel = apiMode() === 'local' && state.kind === 'tracking'

  return (
    <div className="top-bar">
      {inOptimization ? (
        <>
          <StepsBar />
          <RunButton busy={busy} canCancel={canCancel} onRun={() => void startJob()} onCancel={() => void cancel()} />
        </>
      ) : (
        <div className="top-bar__title">
          {Glyph && <Glyph aria-hidden="true" size={20} />}
          <div className="top-bar__screen" ref={titleRef} />
        </div>
      )}
      {busy && <span className="top-bar__progress" aria-hidden="true" />}
    </div>
  )
}

/**
 * "Optimizuj", as smartLoad+'s RunButton: the play icon pulses on hover. While it runs it says
 * "Računam…" with the time; on hover or focus that turns into "X Prekini" and a click stops it.
 */
function RunButton(props: { busy: boolean; canCancel: boolean; onRun: () => void; onCancel: () => void }) {
  if (!props.busy) {
    return (
      <button type="button" className="btn btn--primary run-btn" onClick={props.onRun}>
        <Play aria-hidden="true" className="run-btn__play" />
        <span>Optimizuj</span>
      </button>
    )
  }
  if (!props.canCancel) {
    return (
      <button type="button" className="btn btn--primary run-btn run-btn--busy" disabled>
        <span className="run-btn__layer">
          <LoaderCircle aria-hidden="true" className="spin" />
          <JobClockText />
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      className="btn btn--primary run-btn run-btn--busy"
      onClick={props.onCancel}
      aria-label="Računam. Pritisnite da prekinete."
    >
      <span className="run-btn__layer run-btn__wait">
        <LoaderCircle aria-hidden="true" className="spin" />
        <JobClockText />
      </span>
      <span className="run-btn__layer run-btn__stop" aria-hidden="true">
        <X className="run-btn__x" />
        <span>Prekini</span>
      </span>
    </button>
  )
}
