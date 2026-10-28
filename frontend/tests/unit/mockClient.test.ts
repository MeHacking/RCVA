import { describe, expect, it } from 'vitest'
import { ApiError, isProvenInfeasible, type ApiClient } from '../../src/api/client'
import { createMockApiClient } from '../../src/api/mock/mockClient'
import type { TruckInput } from '../../src/api/types'
import { SCENARIOS, type ScenarioName } from '../../src/fixtures'

const QUEUED_MS = 100
const RUNNING_MS = 1000
const REQUEST = { timeLimitSeconds: 60, truckIds: null, shipmentIds: null }

function setup(name: ScenarioName): { api: ApiClient; advance: (ms: number) => void } {
  let clock = 1_700_000_000_000
  const api = createMockApiClient({
    scenario: SCENARIOS[name],
    latencyMs: 0,
    queuedMs: QUEUED_MS,
    runningMs: RUNNING_MS,
    now: () => clock,
  })
  return { api, advance: (ms) => (clock += ms) }
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('mock optimization job transitions', () => {
  it('QUEUED -> RUNNING -> COMPLETED with score and result (test 7)', async () => {
    const { api, advance } = setup('test7')
    const created = await api.createOptimizationJob(REQUEST)
    expect(created.status).toBe('QUEUED')

    expect((await api.getOptimizationJob(created.id)).status).toBe('QUEUED')
    expect((await rejection(api.getOptimizationResult(created.id))).status).toBe(409)

    advance(QUEUED_MS)
    const running = await api.getOptimizationJob(created.id)
    expect(running.status).toBe('RUNNING')
    expect(running.startedAt).not.toBeNull()
    expect(running.finishedAt).toBeNull()
    expect((await rejection(api.getOptimizationResult(created.id))).status).toBe(409)

    advance(RUNNING_MS)
    const done = await api.getOptimizationJob(created.id)
    expect(done).toMatchObject({
      status: 'COMPLETED',
      infeasibilityKind: null,
      feasible: true,
      scoreHard: 0,
      scoreMedium: -2,
      scoreSoft: -1001489,
      trucksLowerBound: 2,
    })
    expect(done.finishedAt).not.toBeNull()

    const result = await api.getOptimizationResult(created.id)
    expect(result.trucksUsed).toBe(2)
    expect(result.totalMeters).toBe(1001489)
  })

  it('ends as INFEASIBLE / NOT_FOUND without a result', async () => {
    const { api, advance } = setup('notFound')
    const { id } = await api.createOptimizationJob(REQUEST)
    advance(QUEUED_MS + RUNNING_MS)

    const job = await api.getOptimizationJob(id)
    expect(job).toMatchObject({ status: 'INFEASIBLE', infeasibilityKind: 'NOT_FOUND', feasible: false })
    expect((await rejection(api.getOptimizationResult(id))).status).toBe(409)
  })

  it('rejects PROVEN with 422 and causes, without creating a job', async () => {
    const { api } = setup('proven')
    const error = await rejection(api.createOptimizationJob(REQUEST))

    expect(isProvenInfeasible(error)).toBe(true)
    expect(error.status).toBe(422)
    expect(error.problem.causes).toEqual(['Pošiljka S-401 (14,0 LDM) je veća od najvećeg kamiona (13,6 LDM).'])
    expect((await rejection(api.getOptimizationJob(1))).status).toBe(404)
  })

  it('rejects a non-positive time limit with 400', async () => {
    const { api } = setup('small')
    const error = await rejection(api.createOptimizationJob({ ...REQUEST, timeLimitSeconds: 0 }))
    expect(error.status).toBe(400)
    expect(error.problem.errors).toHaveProperty('timeLimitSeconds')
  })

  it('returns 404 for an unknown job', async () => {
    const { api } = setup('small')
    expect((await rejection(api.getOptimizationJob(99))).status).toBe(404)
  })
})

describe('mock trucks', () => {
  const VALID: TruckInput = {
    name: 'Novi',
    capacityLdmTenths: 136,
    available: true,
    innerLengthMm: null,
    innerWidthMm: null,
    innerHeightMm: null,
  }

  it('updates a truck and returns copies, not internal state', async () => {
    const { api } = setup('small')
    const updated = await api.updateTruck(1, { ...VALID, name: 'Šleper 1a', capacityLdmTenths: 130 })
    updated.name = 'mutated by caller'

    const trucks = await api.listTrucks()
    expect(trucks.find((t) => t.id === 1)).toMatchObject({ name: 'Šleper 1a', capacityLdmTenths: 130 })
    expect(SCENARIOS.small.trucks.find((t) => t.id === 1)?.name).toBe('Šleper 1')
  })

  it('creates a truck with a new id', async () => {
    const { api } = setup('small')
    const created = await api.createTruck(VALID)
    expect(created.id).toBe(4)
    expect(await api.listTrucks()).toHaveLength(4)
  })

  it('rejects capacity 0 with 400 and a field error', async () => {
    const { api } = setup('small')
    const error = await rejection(api.updateTruck(1, { ...VALID, capacityLdmTenths: 0 }))
    expect(error.status).toBe(400)
    expect(error.problem.errors).toHaveProperty('capacityLdmTenths')
  })

  it('returns 404 when updating an unknown truck', async () => {
    const { api } = setup('small')
    expect((await rejection(api.updateTruck(99, VALID))).status).toBe(404)
  })
})

describe('mock truck removal', () => {
  it('removes a truck (204) and then reports 404 for it', async () => {
    const { api } = setup('small')
    await api.deleteTruck(3)
    expect((await api.listTrucks()).map((t) => t.id)).toEqual([1, 2])
    expect((await rejection(api.deleteTruck(3))).status).toBe(404)
  })

  it('refuses with 409 while a job is queued or running, allows it once the job ends', async () => {
    const { api, advance } = setup('small')
    await api.createOptimizationJob(REQUEST)
    const queued = await rejection(api.deleteTruck(1))
    expect(queued.status).toBe(409)
    expect(queued.message).toMatch(/Optimizacija #1 je u toku/)

    advance(QUEUED_MS)
    expect((await rejection(api.deleteTruck(1))).status).toBe(409)

    advance(RUNNING_MS)
    await api.deleteTruck(1)
    expect((await api.listTrucks()).map((t) => t.id)).toEqual([2, 3])
  })
})
