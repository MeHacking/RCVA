import { describe, expect, it } from 'vitest'
import type { JobStatus, OptimizationJob, OptimizationResult } from '../../src/api/types'
import { NOTHING_SEEN, noticeFor, observeJob, type SeenJob } from '../../src/app/jobNotices'
import type { LastJobState } from '../../src/features/optimization/lastJobContext'
import { NOT_FOUND_MESSAGE } from '../../src/features/optimization/jobStatus'

function job(id: number, status: JobStatus, infeasibilityKind: OptimizationJob['infeasibilityKind'] = null): OptimizationJob {
  return {
    id,
    status,
    infeasibilityKind,
    createdAt: '2026-11-20T10:00:00Z',
    startedAt: null,
    finishedAt: null,
    timeLimitSeconds: 60,
    scoreHard: null,
    scoreMedium: null,
    scoreSoft: null,
    feasible: null,
    trucksLowerBound: null,
  }
}

function result(passed = true): OptimizationResult {
  return {
    status: 'COMPLETED',
    feasible: true,
    trucksUsed: 2,
    trucksLowerBound: 2,
    totalMeters: 1_001_489,
    routes: [],
    unassignedShipmentIds: [],
    validation: { passed, violations: passed ? [] : ['x'] },
  }
}

function tracking(jobId: number, current: OptimizationJob | null, res: OptimizationResult | null = null): LastJobState {
  return { kind: 'tracking', jobId, options: {}, job: current, result: res, pollError: null }
}

/** Feeds the states in order; the ids of the jobs reported as ended. */
function ends(states: LastJobState[], from: SeenJob = NOTHING_SEEN): number[] {
  let seen = from
  const ended: number[] = []
  for (const state of states) {
    const step = observeJob(seen, state)
    seen = step.seen
    if (step.ended) ended.push(step.ended.job.id)
  }
  return ended
}

describe('observeJob', () => {
  it('reports a job seen running when it ends, once', () => {
    const done = tracking(7, job(7, 'COMPLETED'), result())
    expect(ends([{ kind: 'starting' }, tracking(7, null), tracking(7, job(7, 'RUNNING')), done, done])).toEqual([7])
  })

  it('reports a job started here that ends before its first status answer', () => {
    expect(ends([{ kind: 'starting' }, tracking(7, null), tracking(7, job(7, 'COMPLETED'), result())])).toEqual([7])
  })

  it('does not report a job that had already ended when the page was opened', () => {
    expect(ends([tracking(7, null), tracking(7, job(7, 'COMPLETED'), result())])).toEqual([])
  })

  it('reports a job found after a reload if it was still running then', () => {
    expect(ends([tracking(7, null), tracking(7, job(7, 'QUEUED')), tracking(7, job(7, 'FAILED'))])).toEqual([7])
  })

  it('waits for the result of a completed job', () => {
    const states = [{ kind: 'starting' } as const, tracking(7, job(7, 'RUNNING')), tracking(7, job(7, 'COMPLETED'))]
    expect(ends(states)).toEqual([])
    expect(ends([...states, tracking(7, job(7, 'COMPLETED'), result())])).toEqual([7])
  })

  it('follows a new job after another', () => {
    const states: LastJobState[] = [
      { kind: 'starting' },
      tracking(7, job(7, 'RUNNING')),
      tracking(7, job(7, 'COMPLETED'), result()),
      { kind: 'starting' },
      tracking(8, null),
      tracking(8, job(8, 'INFEASIBLE', 'NOT_FOUND')),
    ]
    expect(ends(states)).toEqual([7, 8])
  })

  it('forgets a job when a start does not create one', () => {
    expect(ends([{ kind: 'starting' }, { kind: 'startFailed', message: 'x', noRoadPlaceIds: [], options: {} }, tracking(7, job(7, 'FAILED'))])).toEqual([])
  })
})

describe('noticeFor', () => {
  const at = new Date('2026-11-20T10:05:00Z')

  it('says how many trucks and kilometres a completed job has', () => {
    const notice = noticeFor(job(7, 'COMPLETED'), result(), at)
    expect(notice).toMatchObject({ kind: 'done', title: 'Optimizacija je završena', at: '2026-11-20T10:05:00.000Z' })
    expect(notice.detail).toBe('Posao #7: kamioni 2, 1001,5 km')
  })

  it('warns when the validator did not pass', () => {
    expect(noticeFor(job(7, 'COMPLETED'), result(false), at)).toMatchObject({ kind: 'failed', title: 'Validator nije prošao' })
  })

  it('keeps the required NOT_FOUND wording, never "infeasible"', () => {
    const notice = noticeFor(job(8, 'INFEASIBLE', 'NOT_FOUND'), null, at)
    expect(notice).toMatchObject({ kind: 'failed', title: 'Rešenje nije nađeno' })
    expect(notice.detail).toContain(NOT_FOUND_MESSAGE)
  })

  it('names a failed and a cancelled job', () => {
    expect(noticeFor(job(9, 'FAILED'), null, at)).toMatchObject({ kind: 'failed', title: 'Optimizacija nije uspela' })
    expect(noticeFor(job(9, 'CANCELLED'), null, at)).toMatchObject({ kind: 'failed', title: 'Optimizacija je otkazana' })
  })
})
