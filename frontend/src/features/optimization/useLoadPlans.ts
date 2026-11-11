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
/** `version`: see routesVersion; a new one asks for the plans again. */
export function useLoadPlans(jobId: number, truckIds: number[], version = '') {
  const api = useApi()
  // The plans with the routes they were made for: those of routes changed since are not shown.
  const [plans, setPlans] = useState<{ of: string; byTruck: ReadonlyMap<number, LoadPlanEntry> }>(() => ({ of: '', byTruck: new Map() }))
  const pending = useRef<Promise<unknown>>(Promise.resolve())
  const key = truckIds.join(',')
  const of = `${jobId}/${version}/${key}`

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
      if (current) setPlans({ of, byTruck: new Map(entries) })
    })
    pending.current = all
    return () => {
      current = false
    }
  }, [api, jobId, key, of])

  return { plans: plans.of === of ? plans.byTruck : new Map<number, LoadPlanEntry>(), ready: () => pending.current }
}
