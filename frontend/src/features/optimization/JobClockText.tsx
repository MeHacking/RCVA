import { formatClock } from '../../format/time'
import type { JobClock } from './jobClock'
import { useJobClock } from './useJobClock'

const PHASE_LABELS: Record<JobClock['phase'], string> = {
  preparing: 'Priprema…',
  queued: 'Čeka red…',
  running: 'Računam…',
}

/** "Računam… 0:12 / 1:00" while the last job goes (nothing otherwise). Not a live region: it ticks. */
export function JobClockText() {
  const clock = useJobClock()
  if (!clock) return null
  return (
    <span className="job-clock" data-testid="job-clock" data-phase={clock.phase}>
      {PHASE_LABELS[clock.phase]}{' '}
      <span className="job-clock__time">
        {formatClock(clock.seconds)}
        {clock.phase === 'running' && clock.limitSeconds !== null && ` / ${formatClock(clock.limitSeconds)}`}
      </span>
    </span>
  )
}
