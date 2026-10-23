import { Badge, type BadgeTone } from '../components/Badge'
import { Icon } from '../components/Icon'
import { formatKm } from '../format/units'
import { JOB_STATUS_LABELS, NOT_FOUND_MESSAGE, PROVEN_TITLE } from '../features/optimization/jobStatus'
import { useLastJob, type LastJobState } from '../features/optimization/lastJobContext'

export function TopBar() {
  const { state, start } = useLastJob()
  const view = describe(state)

  return (
    <div className="top-bar">
      <div className="job-status" data-testid="last-job-status" role="status" aria-live="polite">
        <span className="job-status__label">Poslednja optimizacija</span>
        <Badge tone={view.tone} pulse={view.busy}>
          {view.label}
        </Badge>
        <span className={`job-status__detail ${view.detailClass ?? ''}`} title={view.details.join(' · ')}>
          {view.details.map((part, index) => (
            <span key={index}>
              {index > 0 && (
                <span className="job-status__sep" aria-hidden="true">
                  ·
                </span>
              )}
              {part}
            </span>
          ))}
        </span>
      </div>
      <button type="button" className="button--primary" onClick={() => void start()} disabled={view.busy}>
        <Icon name="play" size={14} />
        Pokreni optimizaciju
      </button>
    </div>
  )
}

interface StatusView {
  tone: BadgeTone
  label: string
  details: string[]
  /** a job is being started or is still running */
  busy: boolean
  detailClass?: string
}

function describe(state: LastJobState): StatusView {
  switch (state.kind) {
    case 'idle':
      return { tone: 'neutral', label: 'Nije pokretano', details: ['Optimizacija još nije pokretana.'], busy: false, detailClass: 'text--muted' }
    case 'starting':
      return { tone: 'info', label: 'Pokretanje', details: ['Slanje zahteva…'], busy: true }
    case 'proven':
      return {
        tone: 'danger',
        label: PROVEN_TITLE,
        details: state.causes.length > 0 ? state.causes : [state.detail],
        busy: false,
        detailClass: 'text--error',
      }
    case 'startFailed':
      return {
        tone: 'danger',
        label: 'Greška',
        details: [`Pokretanje nije uspelo: ${state.message}`],
        busy: false,
        detailClass: 'text--error',
      }
    case 'tracking': {
      const jobLabel = `Posao #${state.jobId}`
      const { job, result, pollError } = state
      if (pollError) {
        return {
          tone: 'danger',
          label: 'Greška',
          details: [jobLabel, `praćenje statusa nije uspelo: ${pollError}`],
          busy: false,
          detailClass: 'text--error',
        }
      }
      if (!job) return { tone: 'info', label: 'Učitavanje', details: [jobLabel], busy: true }

      switch (job.status) {
        case 'QUEUED':
          return { tone: 'info', label: JOB_STATUS_LABELS.QUEUED, details: [jobLabel], busy: true }
        case 'RUNNING':
          return {
            tone: 'info',
            label: JOB_STATUS_LABELS.RUNNING,
            details: [jobLabel, `vremensko ograničenje ${job.timeLimitSeconds} s`],
            busy: true,
          }
        case 'COMPLETED': {
          if (!result) return { tone: 'success', label: JOB_STATUS_LABELS.COMPLETED, details: [jobLabel], busy: false }
          const passed = result.validation.passed
          return {
            tone: passed ? 'success' : 'danger',
            label: passed ? JOB_STATUS_LABELS.COMPLETED : 'Validator nije prošao',
            details: [
              jobLabel,
              `Kamioni: ${result.trucksUsed}`,
              formatKm(result.totalMeters),
              `Validator: ${passed ? 'prošao' : 'nije prošao'}`,
            ],
            busy: false,
          }
        }
        case 'INFEASIBLE':
          return job.infeasibilityKind === 'NOT_FOUND'
            ? { tone: 'warning', label: 'Rešenje nije nađeno', details: [jobLabel, NOT_FOUND_MESSAGE], busy: false }
            : { tone: 'danger', label: JOB_STATUS_LABELS.INFEASIBLE, details: [jobLabel], busy: false }
        case 'CANCELLED':
          return { tone: 'neutral', label: JOB_STATUS_LABELS.CANCELLED, details: [jobLabel], busy: false }
        case 'FAILED':
          return { tone: 'danger', label: JOB_STATUS_LABELS.FAILED, details: [jobLabel], busy: false }
      }
    }
  }
}
