import { Link } from 'react-router'
import { PATHS } from '../../app/paths'
import { Badge } from '../../components/Badge'
import { Notice } from '../../components/Notice'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatTime } from '../../format/time'
import type { OptimizationJob } from '../../api/types'
import { JOB_STATUS_LABELS, NOT_FOUND_MESSAGE, PROVEN_TITLE } from './jobStatus'
import { useLastJob, type LastJobState } from './lastJobContext'
import { ResultView } from './ResultView'
import { apiMode } from '../../api/apiMode'
import { LocationsCheck, ShortageActions } from './FleetActions'
import { UnreachablePlaces } from './UnreachablePlaces'
import { JobClockText } from './JobClockText'
import { useJobClock } from './useJobClock'

// Only the application on the device adds trucks or plans without some shipments.
const FLEET_ACTIONS = apiMode() === 'local'

/** The view "Rute" of the step Rezultat: the job's state, then its result (summary and routes). */
export function OptimizationPage() {
  const { state } = useLastJob()
  return <JobOutcome state={state} />
}

function JobOutcome({ state }: { state: LastJobState }) {
  switch (state.kind) {
    case 'idle':
      return (
        <EmptyState title="Optimizacija još nije pokretana">
          Pošiljke unesite u koraku <Link to={PATHS.shipments}>Pošiljke</Link>, potvrdite gde su kamioni, pa u koraku{' '}
          <Link to={PATHS.time}>Vreme</Link> zadajte vremensko ograničenje i pokrenite optimizaciju. Rezultat se ovde
          pojavljuje automatski kada posao završi: broj kamiona, kilometraža, provera validatora i ruta svakog kamiona.
        </EmptyState>
      )
    case 'starting':
      return <LoadingState label="Pokretanje optimizacije…" />
    case 'needsLocations':
      return <LocationsCheck options={state.options} />
    case 'proven':
      return (
        <Notice tone="danger" title={`${PROVEN_TITLE} (HTTP 422)`} role="alert">
          <p>{state.detail}</p>
          {state.causes.length > 0 && (
            <ul className="notice__list">
              {state.causes.map((cause) => (
                <li key={cause}>{cause}</li>
              ))}
            </ul>
          )}
          {FLEET_ACTIONS && state.missingTrucks !== null && (
            <>
              <p>
                <strong>Nema dovoljno kamiona:</strong> potrebno je još najmanje {state.missingTrucks}.
              </p>
              <ShortageActions add={state.missingTrucks} options={state.options} />
            </>
          )}
        </Notice>
      )
    case 'startFailed':
      return (
        <>
          <ErrorState title="Pokretanje nije uspelo" message={state.message} />
          {/* Places the application could not move to a point lorries reach (on the device). */}
          {FLEET_ACTIONS && state.noRoadPlaceIds.length > 0 && <UnreachablePlaces key={state.noRoadPlaceIds.join()} placeIds={state.noRoadPlaceIds} />}
        </>
      )
    case 'tracking': {
      const { job, result, pollError, jobId, options } = state
      if (pollError) return <ErrorState title={`Praćenje posla #${jobId} nije uspelo`} message={pollError} />
      if (!job) return <LoadingState label={`Učitavanje statusa posla #${jobId}…`} />

      switch (job.status) {
        case 'QUEUED':
        case 'RUNNING':
          return <JobProgress job={job} />
        case 'COMPLETED':
          return result ? (
            <ResultView job={job} result={result} options={FLEET_ACTIONS ? options : null} />
          ) : (
            <LoadingState label="Učitavanje rezultata…" />
          )
        case 'INFEASIBLE':
          return job.infeasibilityKind === 'NOT_FOUND' ? (
            <Notice tone="warning" title={`Posao #${job.id}: rešenje nije nađeno`} role="status">
              <p>{NOT_FOUND_MESSAGE}</p>
              {job.trucksLowerBound !== null && (
                <p className="text--muted">
                  Donja granica broja kamiona po kapacitetu: {job.trucksLowerBound}. Možete pokušati sa dužim
                  vremenskim ograničenjem.
                </p>
              )}
              {FLEET_ACTIONS && (
                <>
                  <p>
                    Moguće je i da dostupni kamioni nisu dovoljni: pošiljke se ne dele, pa ukupni kapacitet nije uvek
                    dovoljan.
                  </p>
                  <ShortageActions add={1} options={options} />
                </>
              )}
            </Notice>
          ) : (
            <Notice tone="danger" title={`Posao #${job.id}: ${JOB_STATUS_LABELS.INFEASIBLE.toLowerCase()}`} role="alert" />
          )
        case 'CANCELLED':
          return <Notice tone="info" title={`Posao #${job.id} je otkazan`} />
        case 'FAILED':
          return <ErrorState title={`Posao #${job.id}: greška solvera`} message="Solver je prijavio grešku." />
      }
    }
  }
}

function JobProgress({ job }: { job: OptimizationJob }) {
  const clock = useJobClock()
  const share = clock?.phase === 'running' && clock.limitSeconds ? Math.min(1, clock.seconds / clock.limitSeconds) : 0
  return (
    <div className="panel job-progress">
      <span className="spinner" aria-hidden="true" />
      <div className="job-progress__body">
        <p className="job-progress__title" role="status">
          Posao #{job.id}{' '}
          <Badge tone="info" pulse>
            {JOB_STATUS_LABELS[job.status]}
          </Badge>
        </p>
        <p className="job-progress__clock">
          <JobClockText />
        </p>
        {/* How much of the time limit has passed; the count itself is the text above. */}
        <span className="job-progress__track" aria-hidden="true">
          <span className="job-progress__bar" style={{ inlineSize: `${share * 100}%` }} />
        </span>
        <p className="text--muted">
          Kreiran {formatTime(job.createdAt)}
          {job.startedAt && ` · pokrenut ${formatTime(job.startedAt)}`} · vremensko ograničenje {job.timeLimitSeconds} s ·
          status se osvežava svake sekunde
        </p>
      </div>
    </div>
  )
}
