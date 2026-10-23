import { formatKm } from '../format/units'
import { JOB_STATUS_LABELS, NOT_FOUND_MESSAGE, PROVEN_TITLE } from '../features/optimization/jobStatus'
import { useLastJob, type LastJobState } from '../features/optimization/lastJobContext'

export function TopBar() {
  const { state, start } = useLastJob()
  const busy =
    state.kind === 'starting' ||
    (state.kind === 'tracking' && (state.job === null || state.job.status === 'QUEUED' || state.job.status === 'RUNNING'))

  return (
    <div className="top-bar">
      <div className="top-bar__status" data-testid="last-job-status">
        <LastJobStatus state={state} />
      </div>
      <button type="button" className="button--primary" onClick={() => void start()} disabled={busy}>
        Pokreni optimizaciju
      </button>
    </div>
  )
}

function LastJobStatus({ state }: { state: LastJobState }) {
  switch (state.kind) {
    case 'idle':
      return <span>Optimizacija još nije pokretana.</span>
    case 'starting':
      return <span role="status">Pokretanje optimizacije…</span>
    case 'proven':
      return (
        <span role="alert" className="text--error">
          {PROVEN_TITLE}: {state.causes.length > 0 ? state.causes.join(' ') : state.detail}
        </span>
      )
    case 'startFailed':
      return (
        <span role="alert" className="text--error">
          Pokretanje nije uspelo: {state.message}
        </span>
      )
    case 'tracking': {
      const prefix = `Posao #${state.jobId}: `
      if (state.pollError) {
        return (
          <span role="alert" className="text--error">
            {prefix}greška pri praćenju statusa: {state.pollError}
          </span>
        )
      }
      const { job, result } = state
      if (!job) return <span role="status">{prefix}učitavanje statusa…</span>
      if (job.status === 'COMPLETED' && result) {
        return (
          <span role="status">
            {prefix}završeno · kamioni: {result.trucksUsed} · {formatKm(result.totalMeters)} · validator:{' '}
            {result.validation.passed ? 'prošao' : 'nije prošao'}
          </span>
        )
      }
      if (job.status === 'INFEASIBLE' && job.infeasibilityKind === 'NOT_FOUND') {
        return (
          <span role="status" className="text--warning">
            {prefix}
            {NOT_FOUND_MESSAGE}
          </span>
        )
      }
      return <span role="status">{prefix + JOB_STATUS_LABELS[job.status]}</span>
    }
  }
}
