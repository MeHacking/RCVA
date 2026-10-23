import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError, isProvenInfeasible } from '../../api/client'
import { isTerminal } from './jobStatus'
import { LastJobContext, type LastJobState } from './lastJobContext'

const POLL_INTERVAL_MS = 1000
const DEFAULT_TIME_LIMIT_SECONDS = 60

/**
 * Tracks the most recently started optimization job for the whole app (top bar, results).
 * Kept in memory only: a page reload forgets it, since the API has no "list jobs" endpoint.
 */
export function LastJobProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const [state, setState] = useState<LastJobState>({ kind: 'idle' })
  const trackedJobId = state.kind === 'tracking' ? state.jobId : null

  const start = useCallback(
    async (timeLimitSeconds = DEFAULT_TIME_LIMIT_SECONDS) => {
      setState({ kind: 'starting' })
      try {
        const created = await api.createOptimizationJob({ timeLimitSeconds, truckIds: null, shipmentIds: null })
        setState({ kind: 'tracking', jobId: created.id, job: null, result: null, pollError: null })
      } catch (error) {
        if (isProvenInfeasible(error)) {
          setState({ kind: 'proven', detail: error.message, causes: error.problem.causes ?? [] })
        } else {
          setState({ kind: 'startFailed', message: describeError(error) })
        }
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
