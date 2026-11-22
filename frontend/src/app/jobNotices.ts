import type { OptimizationJob, OptimizationResult } from '../api/types'
import { NOT_FOUND_MESSAGE, isTerminal } from '../features/optimization/jobStatus'
import type { LastJobState } from '../features/optimization/lastJobContext'
import { formatKm } from '../format/units'

/**
 * Notifications (the bell in the top bar), as in smartLoad+ (owner, 20.11.2026): an optimization
 * that ends while another screen is open leaves one; opening Rezultati clears them. Only a job
 * seen running in this visit counts: after a reload, a job that had already ended does not.
 */
export interface JobNotice {
  id: string
  kind: 'done' | 'failed'
  title: string
  detail: string
  /** ISO time it arrived */
  at: string
}

/** What has been seen of the tracked job so far. */
export interface SeenJob {
  /** null: no job yet (or one is being started) */
  jobId: number | null
  /** the job was seen queued or running (or being started) in this visit, and has not ended since */
  open: boolean
}

export const NOTHING_SEEN: SeenJob = { jobId: null, open: false }

/**
 * Follows the last job's state; `ended` is the job (with its result) when it has just ended
 * after being seen open.
 */
export function observeJob(
  seen: SeenJob,
  state: LastJobState,
): { seen: SeenJob; ended: { job: OptimizationJob; result: OptimizationResult | null } | null } {
  if (state.kind === 'starting') return { seen: { jobId: null, open: true }, ended: null }
  if (state.kind !== 'tracking') return { seen: NOTHING_SEEN, ended: null }
  // A job that was just started (seen 'starting') is open from its first moment, so one that
  // ends before the first status answer still counts; one found after a reload is not.
  const current = seen.jobId === state.jobId ? seen : { jobId: state.jobId, open: seen.jobId === null && seen.open }
  if (!state.job) return { seen: current, ended: null }
  if (!isTerminal(state.job.status)) return { seen: { jobId: state.jobId, open: true }, ended: null }
  // A completed job counts once its result is loaded (it comes with the same status answer).
  if (state.job.status === 'COMPLETED' && !state.result) return { seen: current, ended: null }
  const ended = current.open ? { job: state.job, result: state.result } : null
  return { seen: { jobId: state.jobId, open: false }, ended }
}

/** The notification for a job that has ended. */
export function noticeFor(job: OptimizationJob, result: OptimizationResult | null, at: Date): JobNotice {
  const base = { id: `${job.id}-${at.getTime()}`, at: at.toISOString() }
  switch (job.status) {
    case 'COMPLETED':
      if (result && !result.validation.passed) {
        return { ...base, kind: 'failed', title: 'Validator nije prošao', detail: 'Rezultat ne poštuje sva pravila.' }
      }
      return {
        ...base,
        kind: 'done',
        title: 'Optimizacija je završena',
        detail: result ? `Kamioni ${result.trucksUsed}, ${formatKm(result.totalMeters)}` : 'Rezultat je spreman.',
      }
    case 'INFEASIBLE':
      return job.infeasibilityKind === 'NOT_FOUND'
        ? { ...base, kind: 'failed', title: 'Rešenje nije nađeno', detail: NOT_FOUND_MESSAGE }
        : { ...base, kind: 'failed', title: 'Nije izvodljivo', detail: 'Optimizacija nije našla izvodljivo rešenje.' }
    case 'CANCELLED':
      return { ...base, kind: 'failed', title: 'Optimizacija je otkazana', detail: 'Računanje je prekinuto.' }
    default:
      return { ...base, kind: 'failed', title: 'Optimizacija nije uspela', detail: 'Greška solvera.' }
  }
}
