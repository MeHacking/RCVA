import { useId, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Icon } from '../../components/Icon'
import { Notice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatTime } from '../../format/time'
import type { OptimizationJob } from '../../api/types'
import { JOB_STATUS_LABELS, NOT_FOUND_MESSAGE, PROVEN_TITLE } from './jobStatus'
import { isLastJobBusy, useLastJob, type LastJobState } from './lastJobContext'
import { ResultView } from './ResultView'
import { apiMode } from '../../api/apiMode'
import { LocationsCheck, ShortageActions } from './FleetActions'
import { UnreachablePlaces } from './UnreachablePlaces'

const DEFAULT_TIME_LIMIT_SECONDS = '60'
// Only the application on the device adds trucks or plans without some shipments.
const FLEET_ACTIONS = apiMode() === 'local'

export function OptimizationPage() {
  const { state } = useLastJob()
  return (
    <section>
      <PageHeader title="Rezultati optimizacije" />
      <StartPanel />
      <JobOutcome state={state} />
    </section>
  )
}

function StartPanel() {
  const { state, start } = useLastJob()
  const id = useId()
  const [timeLimit, setTimeLimit] = useState(DEFAULT_TIME_LIMIT_SECONDS)
  const [error, setError] = useState<string | null>(null)
  const busy = isLastJobBusy(state)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = timeLimit.trim()
    if (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0) {
      setError('Unesite ceo broj sekundi veći od 0.')
      return
    }
    setError(null)
    void start({ timeLimitSeconds: Number(trimmed) })
  }

  return (
    <form className="panel start-panel" onSubmit={handleSubmit} noValidate>
      <div className="field start-panel__field">
        <label htmlFor={`${id}-limit`}>Vremensko ograničenje (s)</label>
        <input
          id={`${id}-limit`}
          inputMode="numeric"
          value={timeLimit}
          onChange={(e) => setTimeLimit(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-limit-error` : `${id}-limit-hint`}
        />
      </div>
      <button type="submit" className="button--primary" disabled={busy}>
        <Icon name="play" size={14} />
        Pokreni optimizaciju
      </button>
      {error ? (
        <span id={`${id}-limit-error`} className="field__error start-panel__note">
          {error}
        </span>
      ) : (
        <span id={`${id}-limit-hint`} className="text--muted start-panel__note">
          Koriste se svi dostupni kamioni i sve pošiljke. Solver vraća najbolje rešenje nađeno u tom vremenu.
        </span>
      )}
    </form>
  )
}

function JobOutcome({ state }: { state: LastJobState }) {
  switch (state.kind) {
    case 'idle':
      return (
        <EmptyState title="Optimizacija još nije pokretana">
          Podesite vremensko ograničenje i kliknite „Pokreni optimizaciju“. Rezultat se ovde pojavljuje
          automatski kada posao završi: broj kamiona, kilometraža, provera validatora i ruta svakog kamiona.
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
  return (
    <div className="panel job-progress" role="status">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="job-progress__title">
          Posao #{job.id}{' '}
          <Badge tone="info" pulse>
            {JOB_STATUS_LABELS[job.status]}
          </Badge>
        </p>
        <p className="text--muted">
          Kreiran {formatTime(job.createdAt)}
          {job.startedAt && ` · pokrenut ${formatTime(job.startedAt)}`} · vremensko ograničenje {job.timeLimitSeconds} s ·
          status se osvežava svake sekunde
        </p>
      </div>
    </div>
  )
}
