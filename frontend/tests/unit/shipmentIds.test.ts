import { describe, expect, it } from 'vitest'
import type { Location, Shipment } from '../../src/api/types'
import { createMockApiClient } from '../../src/api/mock/mockClient'
import { fileNameIdRenames, looksLikeFileNameId, placeCode, relationId } from '../../src/domain/shipmentIds'
import { SCENARIOS } from '../../src/fixtures'

describe('placeCode', () => {
  it.each([
    ['Kragujevac', 'KRA'],
    ['Šabac', 'SAB'],
    ['Đakovo', 'DAK'],
    ['Beograd – magacin', 'BEO'],
    ['Växjö', 'VAX'],
    ['St. Olof', 'STO'],
    ['Ub', 'UB'],
    ['', 'X'],
    [null, 'X'],
  ])('%j -> %j', (name, code) => {
    expect(placeCode(name)).toBe(code)
  })
})

describe('relationId', () => {
  it('takes the first free number of the relation, and counts it as taken', () => {
    const taken = new Set(['KRA-STE-1', 'KRA-STE-3'])
    expect(relationId('Kragujevac', 'Stenkullen', taken)).toBe('KRA-STE-2')
    expect(relationId('Kragujevac', 'Stenkullen', taken)).toBe('KRA-STE-4')
    expect(relationId('Leskovac', 'Landskrona', taken)).toBe('LES-LAN-1')
    expect(relationId(null, 'Landskrona', taken)).toBe('X-LAN-1')
  })
})

describe('IDs made from the file name', () => {
  it.each([
    ['Relacija-tezina-dimenzija-14', true],
    ['Relacije-oktobar-2', true],
    ['Nedelja45-3', true],
    ['KRA-STE-1', false], // a short one already
    ['A-1', false],
    ['S-103', false],
    ['ORD-12', false],
    ['Relacija-tezina', false], // no row number
    ['Relacija tezina-14', false], // a space: not what the import made
  ])('%j: %j', (id, expected) => {
    expect(looksLikeFileNameId(id)).toBe(expected)
  })

  it('gives each a name by relation, after the names the other shipments have', () => {
    const locations = [
      { id: 1, name: 'Kragujevac' },
      { id: 2, name: 'Stenkullen' },
    ] as Location[]
    const shipment = (id: number, externalId: string) => ({ id, externalId, pickupLocationId: 1, deliveryLocationId: 2 }) as Shipment
    const shipments = [shipment(3, 'Relacija-tezina-14'), shipment(1, 'KRA-STE-1'), shipment(2, 'Relacija-tezina-13')]
    expect(fileNameIdRenames(shipments, locations)).toEqual([
      { shipmentId: 2, from: 'Relacija-tezina-13', to: 'KRA-STE-2' },
      { shipmentId: 3, from: 'Relacija-tezina-14', to: 'KRA-STE-3' },
    ])
  })
})

describe('import without an ID column', () => {
  const sheet = [
    ['ID', 'RELACIJA', 'DIMENZIJE'],
    ['', 'KRAGUJEVAC - STENKULLEN', '2,4m'],
    ['', 'KRAGUJEVAC - STENKULLEN', '1m'],
    ['NALOG-7', 'LESKOVAC - LANDSKRONA', '1m'],
    ['', 'LESKOVAC - LANDSKRONA', '1m'],
    ['', '12345 SODERTALJE', '1m'], // no pickup
  ]

  it('names a row without an ID by relation, keeps an ID from the file, and renames after a correction', async () => {
    const api = createMockApiClient({ scenario: SCENARIOS.small, readWorkbook: async () => [{ sheet: 'Sheet1', data: sheet }], latencyMs: 0 })
    const { importId } = await api.createImport(new File(['fake'], 'Relacija tezina dimenzija.xlsx'))
    await api.setImportMapping(importId, { sheetName: 'Sheet1', headerRow: 1, columns: { externalId: 0, relation: 1, ldm: 2 } })
    const { rows } = await api.getImportPreview(importId)
    expect(rows.map((r) => r.externalId)).toEqual(['KRA-STE-1', 'KRA-STE-2', 'NALOG-7', 'LES-LAN-1', 'X-SOD-1'])

    // The place corrected by hand: the name follows it.
    const corrected = await api.updateImportRow(importId, 6, { pickup: { name: 'Subotica', postalCode: null, country: null } })
    expect(corrected.externalId).toBe('SUB-SOD-1')
    await api.commitImport(importId)
    const ids = (await api.listShipments()).map((s) => s.externalId)
    expect(ids).toEqual(expect.arrayContaining(['KRA-STE-1', 'KRA-STE-2', 'NALOG-7', 'LES-LAN-1', 'SUB-SOD-1']))
  })

  it('continues the numbers of the shipments there are', async () => {
    const api = createMockApiClient({ scenario: SCENARIOS.small, readWorkbook: async () => [{ sheet: 'Sheet1', data: sheet }], latencyMs: 0 })
    for (const name of ['prva.xlsx', 'druga.xlsx']) {
      const { importId } = await api.createImport(new File(['fake'], name))
      await api.setImportMapping(importId, { sheetName: 'Sheet1', headerRow: 1, columns: { relation: 1, ldm: 2 } })
      await api.updateImportRow(importId, 6, { excluded: true })
      await api.commitImport(importId)
    }
    const ids = (await api.listShipments()).map((s) => s.externalId).filter((id) => id.startsWith('KRA-STE'))
    expect(ids).toEqual(['KRA-STE-1', 'KRA-STE-2', 'KRA-STE-3', 'KRA-STE-4'])
  })
})

describe('shortenShipmentIds', () => {
  it('renames only the IDs made from the file name, and only once', async () => {
    const scenario = structuredClone(SCENARIOS.small)
    scenario.shipments[0].externalId = 'Relacija-tezina-dimenzija-2'
    const api = createMockApiClient({ scenario, latencyMs: 0 })
    const before = await api.listShipments()
    expect(await api.shortenShipmentIds()).toEqual({ renamed: 1 })
    const after = await api.listShipments()
    const locations = await api.listLocations()
    const name = (id: number) => locations.find((l) => l.id === id)!.name
    const renamed = after[0]
    expect(renamed.externalId).toBe(`${placeCode(name(renamed.pickupLocationId))}-${placeCode(name(renamed.deliveryLocationId))}-1`)
    expect(after.slice(1)).toEqual(before.slice(1))
    expect(await api.shortenShipmentIds()).toEqual({ renamed: 0 })
  })
})
