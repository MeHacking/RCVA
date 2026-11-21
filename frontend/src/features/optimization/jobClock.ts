import type { LastJobState } from './lastJobContext'

/**
 * How long the last job has been going (user, 21.11.2026: a count while solving, as in
 * smartLoad+, so the user sees how much time has passed). "preparing": before the job exists
 * (truck locations, and on the device the road distances from ORS, not counted in the limit);
 * "queued": waiting for an earlier job; "running": solving, counted from the job's start.
 */
export interface JobClock {
  phase: 'preparing' | 'queued' | 'running'
  /** whole seconds since that phase began */
  seconds: number
  /** the job's time limit, once it is known */
  limitSeconds: number | null
}

/** How long a finished job took, start to finish, in whole seconds; null when it did not run to an end. */
export function jobDurationSeconds(job: { startedAt: string | null; finishedAt: string | null }): number | null {
  if (!job.startedAt || !job.finishedAt) return null
  const ms = Date.parse(job.finishedAt) - Date.parse(job.startedAt)
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null
}

export function jobClock(state: LastJobState, nowMs: number): JobClock | null {
  const since = (startMs: number) => Math.max(0, Math.floor((nowMs - startMs) / 1000))
  if (state.kind === 'starting') {
    return { phase: 'preparing', seconds: state.since === undefined ? 0 : since(state.since), limitSeconds: null }
  }
  if (state.kind !== 'tracking' || state.pollError) return null
  const { job } = state
  const limitSeconds = job?.timeLimitSeconds ?? state.options.timeLimitSeconds ?? null
  if (!job) return { phase: 'queued', seconds: 0, limitSeconds }
  const at = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? since(Date.parse(iso)) : 0)
  if (job.status === 'QUEUED') return { phase: 'queued', seconds: at(job.createdAt), limitSeconds }
  if (job.status === 'RUNNING') return { phase: 'running', seconds: at(job.startedAt), limitSeconds }
  return null
}
