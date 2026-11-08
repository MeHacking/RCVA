import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { LoadPlan } from '../../api/types'

/** A truck's load plan, or why there is none (e.g. no cargo space entered). */
export type LoadPlanEntry = { plan: LoadPlan } | { error: string }

/**
 * The load plans of a result's trucks, for the drawings in the PDF. `ready` waits until every
 * plan is in (or failed), so a PDF made right after the result shows the drawings too.
 */
export function useLoadPlans(jobId: number, truckIds: number[]) {
  const api = useApi()
  const [plans, setPlans] = useState<ReadonlyMap<number, LoadPlanEntry>>(() => new Map())
  const pending = useRef<Promise<unknown>>(Promise.resolve())
  const key = truckIds.join(',')

  useEffect(() => {
    let current = true
    const ids = key === '' ? [] : key.split(',').map(Number)
    const all = Promise.all(
      ids.map(async (truckId): Promise<[number, LoadPlanEntry]> => {
        try {
          return [truckId, { plan: await api.getLoadPlan(jobId, truckId) }]
        } catch (error) {
          return [truckId, { error: describeError(error) }]
        }
      }),
    ).then((entries) => {
      if (current) setPlans(new Map(entries))
    })
    pending.current = all
    return () => {
      current = false
    }
  }, [api, jobId, key])

  return { plans, ready: () => pending.current }
}
