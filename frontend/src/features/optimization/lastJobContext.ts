import { createContext, useContext } from 'react'
import type { OptimizationJob, OptimizationResult } from '../../api/types'

export type LastJobState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  /** 422 from POST /optimization-jobs: no job was created */
  | { kind: 'proven'; detail: string; causes: string[] }
  | { kind: 'startFailed'; message: string }
  | {
      kind: 'tracking'
      jobId: number
      /** null until the first status response */
      job: OptimizationJob | null
      /** set once the job is COMPLETED */
      result: OptimizationResult | null
      pollError: string | null
    }

export interface LastJobContextValue {
  state: LastJobState
  /** Starts a job on all available trucks and all shipments, then polls its status. */
  start: (timeLimitSeconds?: number) => Promise<void>
}

export const LastJobContext = createContext<LastJobContextValue | null>(null)

/** A job is being started or is still queued/running, so a new one must not be started. */
export function isLastJobBusy(state: LastJobState): boolean {
  if (state.kind === 'starting') return true
  if (state.kind !== 'tracking' || state.pollError) return false
  return state.job === null || state.job.status === 'QUEUED' || state.job.status === 'RUNNING'
}

export function useLastJob(): LastJobContextValue {
  const value = useContext(LastJobContext)
  if (!value) throw new Error('useLastJob must be used inside <LastJobProvider>')
  return value
}
