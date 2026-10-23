import { TERMINAL_JOB_STATUSES, type JobStatus } from '../../api/types'

/** Required wording (master prompt): NOT_FOUND must never read as "infeasible". */
export const NOT_FOUND_MESSAGE =
  'Solver nije našao rešenje u zadatom vremenu. To ne znači da rešenje ne postoji.'

export const PROVEN_TITLE = 'Dokazano neizvodljivo'

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  QUEUED: 'u redu čekanja',
  RUNNING: 'optimizacija u toku…',
  COMPLETED: 'završeno',
  INFEASIBLE: 'nije izvodljivo',
  CANCELLED: 'otkazano',
  FAILED: 'greška solvera',
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status)
}
