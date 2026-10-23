import { describe, expect, it } from 'vitest'
import type { OptimizationResult } from '../../src/api/types'
import { buildTruckRows, buildUnassignedRows, type ReferenceData } from '../../src/features/optimization/resultRows'
import { SCENARIOS } from '../../src/fixtures'

function completed(name: 'test7' | 'small'): { result: OptimizationResult; ref: ReferenceData } {
  const scenario = SCENARIOS[name]
  if (scenario.outcome.kind !== 'COMPLETED') throw new Error(`${name} must be COMPLETED`)
  return {
    result: scenario.outcome.result,
    ref: { trucks: scenario.trucks, shipments: scenario.shipments, locations: scenario.locations, base: scenario.base },
  }
}

describe('buildTruckRows (test 7)', () => {
  const { result, ref } = completed('test7')
  const rows = buildTruckRows(result, ref)

  it('resolves names, shipments in pickup order and capacity', () => {
    expect(rows.map((r) => [r.truckName, r.shipmentLabels, r.usedLdmTenths, r.capacityLdmTenths])).toEqual([
      ['Kamion A', ['S1', 'S3'], 100, 100],
      ['Kamion B', ['S2', 'S4'], 100, 100],
    ])
  })

  it('derives the return leg so that legs + return = route total', () => {
    const [first, second] = rows
    expect(first.returnLegMeters).toBe(100000) // S3 delivery (-100, 0) -> base
    expect(second.returnLegMeters).toBe(100499) // S4 delivery (-100, 10) -> base
    for (const row of rows) {
      expect(row.stops.reduce((sum, s) => sum + s.legMeters, 0) + row.returnLegMeters).toBe(row.totalMeters)
    }
    expect(first.baseName).toBe('Baza (0, 0)')
  })

  it('labels stops with location and shipment', () => {
    expect(rows[0].stops.map((s) => `${s.sequence} ${s.type} ${s.locationName} ${s.shipmentLabel}`)).toEqual([
      '1 PICKUP Tačka (-50, 0) S1',
      '2 PICKUP Tačka (50, 0) S3',
      '3 DELIVERY Tačka (100, 0) S1',
      '4 DELIVERY Tačka (-100, 0) S3',
    ])
  })
})

describe('missing master data', () => {
  const { result, ref } = completed('small')

  it('falls back to ids instead of failing', () => {
    const rows = buildTruckRows(result, { ...ref, trucks: [], locations: [], shipments: [] })
    expect(rows[0].truckName).toBe('Kamion #1')
    expect(rows[0].capacityLdmTenths).toBeNull()
    expect(rows[0].stops[0].locationName).toMatch(/^Lokacija #\d+$/)
    expect(rows[0].shipmentLabels[0]).toMatch(/^Pošiljka #\d+$/)
  })
})

describe('buildUnassignedRows', () => {
  const { result, ref } = completed('small')

  it('is empty when everything is assigned', () => {
    expect(buildUnassignedRows(result, ref)).toEqual([])
  })

  it('describes unassigned shipments', () => {
    const rows = buildUnassignedRows({ ...result, unassignedShipmentIds: [105, 999] }, ref)
    expect(rows).toEqual([
      { shipmentId: 105, label: 'S-105', ldmTenths: 24, pickupName: 'Leskovac', deliveryName: 'Landskrona' },
      { shipmentId: 999, label: 'Pošiljka #999', ldmTenths: null, pickupName: '–', deliveryName: '–' },
    ])
  })
})
