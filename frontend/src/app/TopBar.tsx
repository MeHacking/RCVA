import { Link, useNavigate } from 'react-router'
import { Badge, type BadgeTone } from '../components/Badge'
import { Icon, type IconName } from '../components/Icon'
import { formatKm } from '../format/units'
import { JOB_STATUS_LABELS, NOT_FOUND_MESSAGE, PROVEN_TITLE } from '../features/optimization/jobStatus'
import { useLastJob, type LastJobState } from '../features/optimization/lastJobContext'

export function TopBar() {
  const { state, start } = useLastJob()
  const navigate = useNavigate()
  const view = describe(state)

  // What the user must answer (truck locations, missing trucks) is on the results screen.
  async function startJob() {
    const kind = await start()
    if (kind === 'needsLocations' || kind === 'proven') navigate('/optimization')
  }

  return (
    <div className="top-bar">
      <div className="job-status" data-testid="last-job-status" role="status" aria-live="polite">
        <Link to="/optimization" className="job-status__link" title={[view.label, ...view.facts.map((f) => f.text), view.message].filter(Boolean).join(' · ')}>
          <span className="visually-hidden">Poslednja optimizacija: </span>
          <Badge tone={view.tone} pulse={view.busy}>
            {view.label}
          </Badge>
          {view.facts.map((fact) => (
            <span
              key={fact.text}
              className={`job-status__fact${fact.minor ? ' job-status__fact--minor' : ''}${fact.tone ? ` job-status__fact--${fact.tone}` : ''}`}
            >
              <Icon name={fact.icon} size={14} />
              {fact.text}
            </span>
          ))}
          {view.message && <span className={`job-status__message ${view.messageClass ?? ''}`}>{view.message}</span>}
        </Link>
      </div>
      <button type="button" className="button--primary" onClick={() => void startJob()} disabled={view.busy}>
        <Icon name="play" size={14} />
        Pokreni optimizaciju
      </button>
      {view.busy && <span className="top-bar__progress" aria-hidden="true" />}
    </div>
  )
}

/** A short fact about the job, shown as a chip with an icon. */
interface Fact {
  icon: IconName
  text: string
  /** hidden first when the bar is narrow */
  minor?: boolean
  /** colours the icon (success) or the whole chip (danger) */
  tone?: 'success' | 'danger'
}

interface StatusView {
  tone: BadgeTone
  label: string
  facts: Fact[]
  /** a sentence after the chips (a cause, an error, what to do) */
  message?: string
  messageClass?: string
  /** a job is being started or is still running */
  busy: boolean
}

function describe(state: LastJobState): StatusView {
  switch (state.kind) {
    case 'idle':
      return { tone: 'neutral', label: 'Nije pokretano', facts: [], message: 'Optimizacija još nije pokretana.', messageClass: 'text--muted', busy: false }
    case 'starting':
      return { tone: 'info', label: 'Pokretanje', facts: [], message: 'Slanje zahteva…', busy: true }
    case 'needsLocations':
      return { tone: 'warning', label: 'Lokacije kamiona', facts: [], message: 'Potvrdite gde su kamioni pre pokretanja.', busy: false }
    case 'proven':
      return {
        tone: 'danger',
        label: PROVEN_TITLE,
        facts: [],
        message: (state.causes.length > 0 ? state.causes : [state.detail]).join(' · '),
        messageClass: 'text--error',
        busy: false,
      }
    case 'startFailed':
      return {
        tone: 'danger',
        label: 'Greška',
        facts: [],
        message: `Pokretanje nije uspelo: ${state.message}`,
        messageClass: 'text--error',
        busy: false,
      }
    case 'tracking': {
      const job: Fact = { icon: 'job', text: `Posao #${state.jobId}` }
      const { job: status, result, pollError } = state
      if (pollError) {
        return {
          tone: 'danger',
          label: 'Greška',
          facts: [job],
          message: `praćenje statusa nije uspelo: ${pollError}`,
          messageClass: 'text--error',
          busy: false,
        }
      }
      if (!status) return { tone: 'info', label: 'Učitavanje', facts: [job], busy: true }

      switch (status.status) {
        case 'QUEUED':
          return { tone: 'info', label: JOB_STATUS_LABELS.QUEUED, facts: [job], busy: true }
        case 'RUNNING':
          return {
            tone: 'info',
            label: JOB_STATUS_LABELS.RUNNING,
            facts: [job, { icon: 'clock', text: `vremensko ograničenje ${status.timeLimitSeconds} s` }],
            busy: true,
          }
        case 'COMPLETED': {
          if (!result) return { tone: 'success', label: JOB_STATUS_LABELS.COMPLETED, facts: [job], busy: false }
          const passed = result.validation.passed
          return {
            tone: passed ? 'success' : 'danger',
            label: passed ? JOB_STATUS_LABELS.COMPLETED : 'Validator nije prošao',
            facts: [
              { ...job, minor: true },
              { icon: 'truck', text: `Kamioni: ${result.trucksUsed}` },
              { icon: 'map', text: formatKm(result.totalMeters) },
              passed
                ? { icon: 'check', text: 'Validator: prošao', minor: true, tone: 'success' }
                : { icon: 'alert', text: 'Validator: nije prošao', tone: 'danger' },
            ],
            busy: false,
          }
        }
        case 'INFEASIBLE':
          return status.infeasibilityKind === 'NOT_FOUND'
            ? { tone: 'warning', label: 'Rešenje nije nađeno', facts: [job], message: NOT_FOUND_MESSAGE, busy: false }
            : { tone: 'danger', label: JOB_STATUS_LABELS.INFEASIBLE, facts: [job], busy: false }
        case 'CANCELLED':
          return { tone: 'neutral', label: JOB_STATUS_LABELS.CANCELLED, facts: [job], busy: false }
        case 'FAILED':
          return { tone: 'danger', label: JOB_STATUS_LABELS.FAILED, facts: [job], busy: false }
      }
    }
  }
}
