import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError, isProvenInfeasible, type ApiClient } from '../../api/client'
import { isTerminal } from './jobStatus'
import { LastJobContext, type LastJobState, type StartOptions } from './lastJobContext'

const POLL_INTERVAL_MS = 1000
const DEFAULT_TIME_LIMIT_SECONDS = 60

/**
 * Tracks the most recently started optimization job for the whole app (top bar, results).
 * After a page reload it asks the API for the latest job; only the application on the
 * device remembers it (the mock and the backend do not, see getLatestOptimizationJob).
 */
export function LastJobProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const [state, setState] = useState<LastJobState>({ kind: 'idle' })
  const trackedJobId = state.kind === 'tracking' ? state.jobId : null

  useEffect(() => {
    let cancelled = false
    api.getLatestOptimizationJob().then(
      (job) => {
        // A job started in the meantime wins.
        if (!cancelled && job) {
          setState((previous) =>
            previous.kind === 'idle'
              ? { kind: 'tracking', jobId: job.id, options: { timeLimitSeconds: job.timeLimitSeconds }, job: null, result: null, pollError: null }
              : previous,
          )
        }
      },
      (error: unknown) => {
        if (!cancelled) console.error('Finding the latest optimization job failed', error)
      },
    )
    return () => {
      cancelled = true
    }
  }, [api])

  const start = useCallback(
    async (options: StartOptions = {}): Promise<LastJobState['kind']> => {
      const set = (next: LastJobState) => {
        setState(next)
        return next.kind
      }
      set({ kind: 'starting' })
      try {
        if (await locationsMissing(api)) return set({ kind: 'needsLocations', options })
        const created = await api.createOptimizationJob({
          timeLimitSeconds: options.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS,
          truckIds: null,
          shipmentIds: null,
          // Sent only when asked for: the backend does not know them.
          ...(options.allowUnassigned ? { allowUnassigned: true } : {}),
          ...(options.freeTrucks ? { freeTrucks: options.freeTrucks } : {}),
        })
        return set({ kind: 'tracking', jobId: created.id, options, job: null, result: null, pollError: null })
      } catch (error) {
        if (isProvenInfeasible(error)) {
          const { causes = [], missingTrucks = null } = error.problem
          return set({ kind: 'proven', detail: error.message, causes, missingTrucks, options })
        }
        return set({ kind: 'startFailed', message: describeError(error) })
      }
    },
    [api],
  )

  useEffect(() => {
    if (trackedJobId === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const update = (patch: Partial<Extract<LastJobState, { kind: 'tracking' }>>) =>
      setState((previous) =>
        previous.kind === 'tracking' && previous.jobId === trackedJobId ? { ...previous, ...patch } : previous,
      )

    const poll = async () => {
      try {
        const job = await api.getOptimizationJob(trackedJobId)
        const result = job.status === 'COMPLETED' ? await api.getOptimizationResult(trackedJobId) : null
        if (cancelled) return
        update({ job, result, pollError: null })
        if (!isTerminal(job.status)) timer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch (error) {
        if (!cancelled) update({ pollError: describeError(error) })
      }
    }
    void poll()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [api, trackedJobId])

  const value = useMemo(() => ({ state, start }), [state, start])
  return <LastJobContext value={value}>{children}</LastJobContext>
}

/**
 * On the device: an available truck has no confirmed location, or the location proposed
 * from its last delivery waits for the user (it is used only once confirmed).
 */
async function locationsMissing(api: ApiClient): Promise<boolean> {
  const starts = await api.getTruckStarts()
  if (!starts) return false
  const available = new Set((await api.listTrucks()).filter((t) => t.available).map((t) => t.id))
  return starts.some((s) => available.has(s.truckId) && (!s.location || s.proposal))
}
