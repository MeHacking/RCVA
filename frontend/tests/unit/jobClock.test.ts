import { describe, expect, it } from 'vitest'
import type { JobStatus, OptimizationJob } from '../../src/api/types'
import { formatClock } from '../../src/format/time'
import { jobClock, jobDurationSeconds } from '../../src/features/optimization/jobClock'
import type { LastJobState } from '../../src/features/optimization/lastJobContext'

const CREATED = Date.parse('2026-11-21T10:00:00Z')
const STARTED = CREATED + 4_000

function job(status: JobStatus, timeLimitSeconds = 60): OptimizationJob {
  return {
    id: 7,
    status,
    infeasibilityKind: null,
    createdAt: new Date(CREATED).toISOString(),
    startedAt: status === 'QUEUED' ? null : new Date(STARTED).toISOString(),
    finishedAt: null,
    timeLimitSeconds,
    scoreHard: null,
    scoreMedium: null,
    scoreSoft: null,
    feasible: null,
    trucksLowerBound: null,
  }
}

function tracking(current: OptimizationJob | null, options = {}): LastJobState {
  return { kind: 'tracking', jobId: 7, options, job: current, result: null, pollError: null }
}

describe('jobClock', () => {
  it('counts a running job from its start, against its time limit', () => {
    expect(jobClock(tracking(job('RUNNING', 90)), STARTED + 12_900)).toEqual({ phase: 'running', seconds: 12, limitSeconds: 90 })
    expect(jobClock(tracking(job('RUNNING')), STARTED)).toEqual({ phase: 'running', seconds: 0, limitSeconds: 60 })
  })

  it('counts the wait of a queued job from when it was made', () => {
    expect(jobClock(tracking(job('QUEUED')), CREATED + 3_000)).toEqual({ phase: 'queued', seconds: 3, limitSeconds: 60 })
  })

  it('counts the preparation before the job exists, without a limit', () => {
    expect(jobClock({ kind: 'starting', since: CREATED }, CREATED + 5_500)).toEqual({ phase: 'preparing', seconds: 5, limitSeconds: null })
    expect(jobClock({ kind: 'starting' }, CREATED)).toEqual({ phase: 'preparing', seconds: 0, limitSeconds: null })
  })

  it('takes the limit from how the job was started until its first status', () => {
    expect(jobClock(tracking(null, { timeLimitSeconds: 30 }), CREATED)).toEqual({ phase: 'queued', seconds: 0, limitSeconds: 30 })
  })

  it('never counts below zero (another clock, e.g. a server)', () => {
    expect(jobClock(tracking(job('RUNNING')), STARTED - 5_000)?.seconds).toBe(0)
  })

  it.each<JobStatus>(['COMPLETED', 'INFEASIBLE', 'CANCELLED', 'FAILED'])('stops once the job is %s', (status) => {
    expect(jobClock(tracking(job(status)), STARTED + 1_000)).toBeNull()
  })

  it('has no count without a job going', () => {
    expect(jobClock({ kind: 'idle' }, CREATED)).toBeNull()
    expect(jobClock({ kind: 'needsLocations', options: {} }, CREATED)).toBeNull()
    expect(jobClock({ ...tracking(job('RUNNING')), pollError: 'x' } as LastJobState, CREATED)).toBeNull()
  })
})

describe('jobDurationSeconds', () => {
  it('is the time from start to finish, in whole seconds', () => {
    expect(jobDurationSeconds({ startedAt: '2026-11-21T10:00:00.000Z', finishedAt: '2026-11-21T10:01:00.400Z' })).toBe(60)
    expect(jobDurationSeconds({ startedAt: '2026-11-21T10:00:00.000Z', finishedAt: '2026-11-21T10:00:40.600Z' })).toBe(41)
  })

  it('is null for a job that did not start or end', () => {
    expect(jobDurationSeconds({ startedAt: null, finishedAt: '2026-11-21T10:00:00Z' })).toBeNull()
    expect(jobDurationSeconds({ startedAt: '2026-11-21T10:00:00Z', finishedAt: null })).toBeNull()
    expect(jobDurationSeconds({ startedAt: 'x', finishedAt: 'y' })).toBeNull()
  })
})

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [9.9, '0:09'],
    [12, '0:12'],
    [60, '1:00'],
    [600, '10:00'],
    [-3, '0:00'],
  ])('%d s is %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text)
  })
})
