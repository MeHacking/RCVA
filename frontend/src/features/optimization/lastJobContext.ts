import { createContext, useContext } from 'react'
import type { OptimizationJob, OptimizationResult } from '../../api/types'

/** How a job is started; the same options start it again (e.g. after the truck locations). */
export interface StartOptions {
  timeLimitSeconds?: number
  /** NOT IN SPEC v2: plan without the shipments the trucks cannot carry */
  allowUnassigned?: boolean
  /** NOT IN SPEC v2: up to this many trucks at no cost (after the advice "one more truck") */
  freeTrucks?: number
}

export type LastJobState =
  | { kind: 'idle' }
  /** "since": when the start was asked for (ms), for the count in the top bar */
  | { kind: 'starting'; since?: number }
  /** on the device: an available truck has no confirmed location, or a proposal waits; no job yet */
  | { kind: 'needsLocations'; options: StartOptions }
  /** 422 from POST /optimization-jobs: no job was created */
  | { kind: 'proven'; detail: string; causes: string[]; missingTrucks: number | null; options: StartOptions }
  /** "noRoadPlaceIds": with 409 Nema puta, the places no road for lorries reaches (NOT IN SPEC v2) */
  | { kind: 'startFailed'; message: string; noRoadPlaceIds: number[]; options: StartOptions }
  | {
      kind: 'tracking'
      jobId: number
      /** how the job was started, to start it again with a change */
      options: StartOptions
      /** null until the first status response */
      job: OptimizationJob | null
      /** set once the job is COMPLETED */
      result: OptimizationResult | null
      pollError: string | null
      /** opened from Istorija, not the job last started */
      fromHistory?: boolean
    }

export interface LastJobContextValue {
  state: LastJobState
  /**
   * Starts a job on all available trucks and all shipments, then polls its status. On the
   * device the truck locations are checked first. Resolves to the state it ends in.
   */
  start: (options?: StartOptions) => Promise<LastJobState['kind']>
  /** "Prekini": stops the tracked job (on the device; NOT IN SPEC v2). Its status then shows CANCELLED. */
  cancel: () => Promise<void>
  /** The result of the tracked job changed (shipments moved by hand). */
  replaceResult: (jobId: number, result: OptimizationResult) => void
  /**
   * Istorija: shows a kept job on Rezultati, Mapa ruta and 3D prikaz instead of the last one,
   * until another job is opened or started. Not while a job is being started or runs.
   */
  open: (jobId: number) => void
  /** The job was deleted: when it is the one shown, nothing is shown any more. */
  close: (jobId: number) => void
}

export const LastJobContext = createContext<LastJobContextValue | null>(null)

/** The last job and its result, but only once it has COMPLETED with a result loaded. */
export function completedJob(state: LastJobState): { job: OptimizationJob; result: OptimizationResult } | null {
  if (state.kind !== 'tracking' || !state.job || !state.result || state.job.status !== 'COMPLETED') return null
  return { job: state.job, result: state.result }
}

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
