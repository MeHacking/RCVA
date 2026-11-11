import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { RouteLine } from '../../api/types'

export type RouteLineState =
  | { status: 'loading' }
  | { status: 'road'; line: RouteLine }
  /** no road line here: a mode without roads, or no ORS key */
  | { status: 'none' }
  | { status: 'error'; message: string }

/**
 * The road lines of the shown routes, asked once per route of the job when it is first
 * shown (the client keeps them, so even that costs no ORS request after the first time).
 * Each line arrives on its own; `retry()` asks again for the ones that failed. Answers
 * that come after another job is shown are dropped.
 */
/** `version`: see routesVersion; the lines of a changed route are asked for again. */
export function useRouteLines(jobId: number, truckIds: number[], version = ''): [Map<number, RouteLineState>, () => void] {
  // The routes as they are now: a job, as changed by hand.
  const scope = `${jobId}/${version}`
  const api = useApi()
  const [lines, setLines] = useState(() => ({ scope, byTruck: new Map<number, RouteLineState>() }))
  const [attempt, setAttempt] = useState(0)
  // `${scope}:${truckId}` already asked, so a filter change asks no route twice; a failed
  // one is asked again only on retry().
  const asked = useRef(new Set<string>())
  const failed = useRef(new Set<string>())
  const shownJob = useRef(scope)
  const wanted = truckIds.join(',')

  useEffect(() => {
    shownJob.current = scope
    const answer = (id: number, state: RouteLineState) => {
      if (state.status === 'error') failed.current.add(`${scope}:${id}`)
      setLines((previous) => {
        if (shownJob.current !== scope) return previous
        const byTruck = new Map(previous.scope === scope ? previous.byTruck : [])
        return { scope, byTruck: byTruck.set(id, state) }
      })
    }
    for (const id of wanted === '' ? [] : wanted.split(',').map(Number)) {
      const key = `${scope}:${id}`
      if (asked.current.has(key)) continue
      asked.current.add(key)
      api.getRouteLine(jobId, id).then(
        (line) => answer(id, line ? { status: 'road', line } : { status: 'none' }),
        (error: unknown) => answer(id, { status: 'error', message: describeError(error) }),
      )
    }
  }, [api, jobId, scope, wanted, attempt])

  const retry = useCallback(() => {
    for (const key of failed.current) asked.current.delete(key)
    failed.current.clear()
    setLines((previous) => {
      const byTruck = new Map(previous.byTruck)
      for (const [id, state] of byTruck) if (state.status === 'error') byTruck.set(id, { status: 'loading' })
      return { ...previous, byTruck }
    })
    setAttempt((n) => n + 1)
  }, [])

  const known = lines.scope === scope ? lines.byTruck : new Map<number, RouteLineState>()
  const byTruck = new Map(truckIds.map((id): [number, RouteLineState] => [id, known.get(id) ?? { status: 'loading' }]))
  return [byTruck, retry]
}
