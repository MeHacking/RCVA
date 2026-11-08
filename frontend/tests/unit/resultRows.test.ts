import { describe, expect, it } from 'vitest'
import type { OptimizationResult } from '../../src/api/types'
import { truckReportFileName, viberChatUrl } from '../../src/features/optimization/exportPdf'
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

describe('a truck for its driver', () => {
  const { result, ref } = completed('small')

  it('names the driver entered on the truck now, and nothing without one', () => {
    const trucks = ref.trucks.map((t, i) => (i === 0 ? { ...t, driverName: 'Marko', driverPhone: '+381 64 123 4567' } : t))
    const rows = buildTruckRows(result, { ...ref, trucks })
    const first = rows.find((r) => r.truckId === ref.trucks[0].id)
    expect([first?.driverName, first?.driverPhone]).toEqual(['Marko', '+381 64 123 4567'])
    expect(rows.filter((r) => r !== first).map((r) => r.driverName)).toEqual(rows.slice(1).map(() => null))
  })

  it('lists what the truck carries, in pickup order, with the places', () => {
    for (const row of buildTruckRows(result, ref)) {
      expect(row.shipments.map((s) => s.label)).toEqual(row.shipmentLabels)
      for (const s of row.shipments) {
        const shipment = ref.shipments.find((x) => x.id === s.shipmentId)!
        expect(s).toMatchObject({ ldmTenths: shipment.ldmTenths, weightKg: shipment.weightKg, description: shipment.description })
        expect(s.pickupName).toBe(ref.locations.find((l) => l.id === shipment.pickupLocationId)!.name)
        expect(s.deliveryName).toBe(ref.locations.find((l) => l.id === shipment.deliveryLocationId)!.name)
      }
    }
  })

  it('names the PDF after the truck, without what a file name cannot hold', () => {
    expect(truckReportFileName(12, 'Šleper 1')).toBe('rcva-Šleper-1-posao-12.pdf')
    expect(truckReportFileName(3, ' Cerada 2/A: "nova" ')).toBe('rcva-Cerada-2-A-nova-posao-3.pdf')
    expect(truckReportFileName(3, '///')).toBe('rcva-kamion-posao-3.pdf')
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

describe('where a route starts (on the device)', () => {
  it('names the truck location of an open route, and nothing without one', () => {
    const { result, ref } = completed('small')
    const open = { ...result, openRoute: true, routes: result.routes.map((r, i) => (i === 0 ? { ...r, startLocationId: 2 } : r)) }
    const rows = buildTruckRows(open, ref)
    expect(rows[0].startName).toBe('Subotica')
    expect(rows[1].startName).toBeNull()
  })
})

describe('viberChatUrl', () => {
  it('opens the chat with the number in the international form', () => {
    expect(viberChatUrl('+381 64 123 4567')).toBe('viber://chat?number=%2B381641234567')
    expect(viberChatUrl('00381 64/123-4567')).toBe('viber://chat?number=%2B381641234567')
  })
})
