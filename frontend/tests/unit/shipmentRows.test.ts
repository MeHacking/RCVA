import { describe, expect, it } from 'vitest'
import type { Location } from '../../src/api/types'
import { buildShipmentRows, shipmentTotals } from '../../src/features/shipments/shipmentRows'
import { shipmentsCsvFileName, shipmentsToCsv } from '../../src/features/shipments/shipmentsCsv'
import { SCENARIOS } from '../../src/fixtures'
import { location, shipment } from '../../src/fixtures/scenario'

const { shipments, locations } = SCENARIOS.small

describe('buildShipmentRows', () => {
  const rows = buildShipmentRows(shipments, locations)

  it('resolves locations and the delivery postal code', () => {
    expect(rows[0]).toMatchObject({
      externalId: 'S-101',
      pickupName: 'Subotica',
      deliveryName: 'Ljungby',
      deliveryPostalCode: '34131',
      ldmTenths: 40,
      weightKg: 3200,
      status: 'OK',
    })
  })

  it('sums LDM and counts errors', () => {
    expect(shipmentTotals(rows)).toEqual({ count: 5, ldmTenths: 209, withErrors: 0 })
  })
})

describe('shipment status (derived, not in Spec v2)', () => {
  const ok = location(1, 'A', 'RS', '11000', [44.8, 20.4])
  const manual = { ...location(2, 'B', 'SE', '34131', [56.8, 13.9]), geocodeStatus: 'MANUAL' as const }
  const failed: Location = { ...location(3, '12345 SODERTALJE', 'SE', '12345', null), geocodeStatus: 'FAILED' }
  const noCoordinates = location(4, 'D', 'SE', null, null)

  const statusOf = (pickupId: number, deliveryId: number, extra: Location[] = []) =>
    buildShipmentRows([shipment(1, 'X', 10, pickupId, deliveryId)], [ok, manual, failed, noCoordinates, ...extra])[0]
      .status

  it.each([
    [1, 1, 'OK'],
    [1, 2, 'MANUAL'],
    [2, 3, 'LOCATION_ERROR'], // the worse of the two wins
    [1, 4, 'LOCATION_ERROR'], // no coordinates cannot be routed
    [1, 99, 'LOCATION_ERROR'], // unknown location
  ] as const)('pickup %i, delivery %i -> %s', (pickupId, deliveryId, expected) => {
    expect(statusOf(pickupId, deliveryId)).toBe(expected)
  })

  it('shows an unknown location by id', () => {
    const [row] = buildShipmentRows([shipment(1, 'X', 10, 1, 99)], [ok])
    expect(row.deliveryName).toBe('Lokacija #99')
    expect(row.deliveryPostalCode).toBeNull()
  })
})

describe('shipmentsToCsv', () => {
  it('writes a header and one line per shipment, with ";" and CRLF', () => {
    const csv = shipmentsToCsv(buildShipmentRows(shipments, locations))
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      'ID;Preuzimanje;Isporuka;Poštanski broj isporuke;LDM;Težina (kg);Dužina (mm);Širina (mm);Visina (mm);Status',
    )
    expect(lines[1]).toBe('S-101;Subotica;Ljungby;34131;4,0;3200;;;;U redu')
    expect(lines[3]).toBe('S-103;Kragujevac;Stenkullen;44361;6,0;5400;6000;2400;2200;U redu')
    expect(lines).toHaveLength(7) // header + 5 rows + trailing empty string
  })

  it('quotes cells containing ";", quotes or line breaks', () => {
    const tricky = location(9, 'Beograd; "Zemun"\nmagacin', 'RS', null, [44.8, 20.4])
    const csv = shipmentsToCsv(buildShipmentRows([shipment(1, 'S;1', 10, 9, 9)], [tricky]))
    expect(csv.split('\r\n')[1]).toBe('"S;1";"Beograd; ""Zemun""\nmagacin";"Beograd; ""Zemun""\nmagacin";;1,0;;;;;U redu')
  })

  it('names the file with the local date', () => {
    expect(shipmentsCsvFileName(new Date(2026, 0, 5))).toBe('posiljke-2026-01-05.csv')
  })
})
