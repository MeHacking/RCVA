import { useLocation, useNavigate } from 'react-router'
import { StepsBar } from '../features/optimization/OptimizationLayout'
import { Icon } from '../components/Icon'
import { isLastJobBusy, useLastJob } from '../features/optimization/lastJobContext'
import { JobClockText } from '../features/optimization/JobClockText'
import { navItemOf } from './navItems'
import { PATHS } from './paths'

/**
 * The top bar, as in smartLoad+ (owner, 21.11.2026): the screen's icon and title on the left (the
 * title is put here by the screen's PageHeader, into `titleRef`), in Optimizacija its steps
 * instead; "Pokreni optimizaciju" on the right, counting the time while a job runs. The last job's
 * chips were taken out (owner, 21.11.2026): its state is in the step Rezultat and the bell.
 */
export function TopBar({ titleRef }: { titleRef: (place: HTMLElement | null) => void }) {
  const { state, start } = useLastJob()
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

  return (
    <div className="top-bar">
      {inOptimization ? (
        <StepsBar />
      ) : (
        <div className="top-bar__title">
          {Glyph && <Glyph aria-hidden="true" size={20} />}
          <div className="top-bar__title-text" ref={titleRef} />
        </div>
      )}
      {busy ? (
        <button type="button" className="button--primary run-clock" disabled>
          <span className="spinner spinner--small" aria-hidden="true" />
          <JobClockText />
        </button>
      ) : (
        <button type="button" className="button--primary" onClick={() => void startJob()}>
          <Icon name="play" size={14} />
          Pokreni optimizaciju
        </button>
      )}
      {busy && <span className="top-bar__progress" aria-hidden="true" />}
    </div>
  )
}
