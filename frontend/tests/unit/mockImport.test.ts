import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { createMockApiClient } from '../../src/api/mock/mockClient'
import type { ImportMapping } from '../../src/api/types'
import { SCENARIOS } from '../../src/fixtures'

// Invented workbook with the shapes of the real file: RELACIJA | TEŽINA | DIMENZIJE.
const SHEET = [
  ['RELACIJA', 'TEŽINA', 'DIMENZIJE'],
  ['BEOGRAD 34131 - LJUNGBY', '1,200 kg', '2,4m'], // row 2: fine, both places geocodable
  ['NIS / RS / - / SE / 55555 VAXJO', '5,3t', '3.6m'], // row 3: fine, Vaxjo not geocodable
  ['ZAJECAR 11111-YSTAD, 22222 LUND', '500 kg', '1m'], // row 4: several destinations
  ['12345 SODERTALJE', '2,300 kg', '3,2m'], // row 5: no pickup
  ['', '', ''], // empty row: skipped
  ['KRAGUJEVAC - LANDSKRONA 26100', '1,5 kg', 'abc'], // row 7: bad LDM, weight warning
]

const MAPPING: ImportMapping = { sheetName: 'Sheet1', headerRow: 1, columns: { relation: 0, weight: 1, ldm: 2 } }

function setup(sheet: string[][] = SHEET): ApiClient {
  return createMockApiClient({
    scenario: SCENARIOS.small,
    latencyMs: 0,
    readWorkbook: async () => [{ sheet: 'Sheet1', data: sheet }],
  })
}

const xlsx = (name = 'Relacije oktobar.xlsx') => new File(['fake'], name)

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('mock Excel import', () => {
  it('uploads a file and returns sheets with preview rows', async () => {
    const created = await setup().createImport(xlsx())
    expect(created).toMatchObject({ importId: 1, fileName: 'Relacije oktobar.xlsx' })
    expect(created.sheets).toEqual([{ name: 'Sheet1', rowCount: 7, previewRows: SHEET.slice(0, 6) }])
  })

  it('rejects a non-.xlsx file with 415 and an unreadable one with 400', async () => {
    const api = setup()
    expect((await rejection(api.createImport(xlsx('posiljke.csv')))).status).toBe(415)
    const broken = createMockApiClient({
      scenario: SCENARIOS.small,
      latencyMs: 0,
      readWorkbook: () => Promise.reject(new Error('not a zip')),
    })
    expect((await rejection(broken.createImport(xlsx()))).status).toBe(400)
  })

  it('validates the mapping', async () => {
    const api = setup()
    const { importId } = await api.createImport(xlsx())
    const error = await rejection(
      api.setImportMapping(importId, { ...MAPPING, columns: { relation: 0, pickup: 1, weight: 1 } }),
    )
    expect(error.status).toBe(400)
    expect(Object.keys(error.problem.errors ?? {}).sort()).toEqual(['columns', 'ldm', 'relation'])
    expect((await rejection(api.getImportPreview(importId))).status).toBe(409)
  })

  it('previews parsed rows with errors and warnings', async () => {
    const api = setup()
    const { importId } = await api.createImport(xlsx())
    await api.setImportMapping(importId, MAPPING)
    const { rows } = await api.getImportPreview(importId)

    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3, 4, 5, 7])
    expect(rows[0]).toMatchObject({
      externalId: 'Relacije-oktobar-2',
      pickup: { name: 'Beograd', postalCode: null, country: null },
      delivery: { name: 'Ljungby', postalCode: '34131', country: null },
      ldmTenths: 24,
      weightKg: 1200,
      errors: [],
      warnings: [],
    })
    expect(rows[1]).toMatchObject({ weightKg: 5300, ldmTenths: 36, errors: [] })
    expect(rows[1].warnings).toEqual([expect.stringMatching(/„Vaxjo“ nije pronađeno/)])
    expect(rows[2].errors).toEqual([expect.stringMatching(/Više odredišta/)])
    expect(rows[3].errors).toEqual(['Nedostaje mesto preuzimanja.'])
    expect(rows[4].errors).toEqual(['LDM „abc“ nije prepoznat (primer: 2,4 ili 2,4m).'])
    expect(rows[4].warnings).toEqual([expect.stringMatching(/ne liči na hiljade/)])
  })

  it('corrects and excludes rows, then commits only valid ones', async () => {
    const api = setup()
    const { importId } = await api.createImport(xlsx())
    await api.setImportMapping(importId, MAPPING)

    const fixed = await api.updateImportRow(importId, 5, { pickup: { name: 'Subotica', postalCode: null, country: 'RS' } })
    expect(fixed).toMatchObject({ corrected: true, errors: [] })
    const ldmFixed = await api.updateImportRow(importId, 7, { ldmTenths: 20 })
    expect(ldmFixed.errors).toEqual([])
    const excluded = await api.updateImportRow(importId, 4, { excluded: true })
    expect(excluded).toMatchObject({ excluded: true, corrected: false })

    expect(await api.commitImport(importId)).toEqual({ created: 4, skipped: 1 })
    expect((await rejection(api.commitImport(importId))).status).toBe(409)

    const shipments = await api.listShipments()
    const locations = await api.listLocations()
    expect(shipments).toHaveLength(5 + 4)
    const imported = shipments.find((s) => s.externalId === 'Relacije-oktobar-5')
    const pickup = locations.find((l) => l.id === imported?.pickupLocationId)
    expect(pickup).toMatchObject({ name: 'Subotica', country: 'RS', geocodeStatus: 'MANUAL' })
    const vaxjo = locations.find((l) => l.name === 'Vaxjo')
    expect(vaxjo).toMatchObject({ postalCode: '55555', geocodeStatus: 'FAILED', lat: null })
  })

  it('flags duplicate IDs within the file and against existing shipments', async () => {
    const api = setup([
      ['ID', 'RELACIJA', 'LDM'],
      ['A-1', 'BEOGRAD - LJUNGBY', '1'],
      ['A-1', 'BEOGRAD - MALMO', '2'],
      ['S-101', 'NIS - LUND 22222', '3'],
    ])
    const { importId } = await api.createImport(xlsx())
    await api.setImportMapping(importId, { sheetName: 'Sheet1', headerRow: 1, columns: { externalId: 0, relation: 1, ldm: 2 } })
    const { rows } = await api.getImportPreview(importId)
    expect(rows[0].errors).toEqual(['ID „A-1“ se ponavlja u redovima 2, 3.'])
    expect(rows[1].errors).toEqual(['ID „A-1“ se ponavlja u redovima 2, 3.'])
    expect(rows[2].errors).toEqual(['ID „S-101“ već postoji među pošiljkama.'])

    // Renaming one duplicate clears the error on both rows.
    await api.updateImportRow(importId, 3, { externalId: 'A-2' })
    const after = await api.getImportPreview(importId)
    expect(after.rows[0].errors).toEqual([])
    expect(after.rows[1].errors).toEqual([])
  })

  it('reads separate pickup / delivery / postal code columns', async () => {
    const api = setup([
      ['Preuzimanje', 'Isporuka', 'PB', 'LDM'],
      ['Beograd', 'Malmo', '21145', '2,4'],
    ])
    const { importId } = await api.createImport(xlsx())
    await api.setImportMapping(importId, {
      sheetName: 'Sheet1',
      headerRow: 1,
      columns: { pickup: 0, delivery: 1, deliveryPostalCode: 2, ldm: 3 },
    })
    const { rows } = await api.getImportPreview(importId)
    expect(rows[0]).toMatchObject({
      pickup: { name: 'Beograd' },
      delivery: { name: 'Malmo', postalCode: '21145' },
      ldmTenths: 24,
      errors: [],
    })
  })
})
