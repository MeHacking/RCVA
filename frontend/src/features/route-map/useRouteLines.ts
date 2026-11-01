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
export function useRouteLines(jobId: number, truckIds: number[]): [Map<number, RouteLineState>, () => void] {
  const api = useApi()
  const [lines, setLines] = useState(() => ({ jobId, byTruck: new Map<number, RouteLineState>() }))
  const [attempt, setAttempt] = useState(0)
  // `${jobId}:${truckId}` already asked, so a filter change asks no route twice; a failed
  // one is asked again only on retry().
  const asked = useRef(new Set<string>())
  const failed = useRef(new Set<string>())
  const shownJob = useRef(jobId)
  const wanted = truckIds.join(',')

  useEffect(() => {
    shownJob.current = jobId
    const answer = (id: number, state: RouteLineState) => {
      if (state.status === 'error') failed.current.add(`${jobId}:${id}`)
      setLines((previous) => {
        if (shownJob.current !== jobId) return previous
        const byTruck = new Map(previous.jobId === jobId ? previous.byTruck : [])
        return { jobId, byTruck: byTruck.set(id, state) }
      })
    }
    for (const id of wanted === '' ? [] : wanted.split(',').map(Number)) {
      const key = `${jobId}:${id}`
      if (asked.current.has(key)) continue
      asked.current.add(key)
      api.getRouteLine(jobId, id).then(
        (line) => answer(id, line ? { status: 'road', line } : { status: 'none' }),
        (error: unknown) => answer(id, { status: 'error', message: describeError(error) }),
      )
    }
  }, [api, jobId, wanted, attempt])

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

  const known = lines.jobId === jobId ? lines.byTruck : new Map<number, RouteLineState>()
  const byTruck = new Map(truckIds.map((id): [number, RouteLineState] => [id, known.get(id) ?? { status: 'loading' }]))
  return [byTruck, retry]
}
