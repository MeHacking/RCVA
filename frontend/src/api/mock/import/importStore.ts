import { ApiError } from '../../client'
import type {
  ImportCommitResult,
  ImportCreated,
  ImportMapping,
  ImportPreview,
  ImportRow,
  ImportRowPatch,
  Location,
  PlaceGuess,
  Shipment,
} from '../../types'
import { geocode, normalizePlaceName } from './gazetteer'
import { applyPatch, readRows, toImportRows, type RowState } from './importRows'

/** Reads every sheet of a workbook; injectable so unit tests need no real .xlsx file. */
export type WorkbookReader = (file: Blob) => Promise<{ sheet: string; data: unknown[][] }[]>

/** Loads read-excel-file only when an import starts, keeping it out of the main bundle. */
export const readWorkbookInBrowser: WorkbookReader = async (file) => {
  const { default: readExcelFile } = await import('read-excel-file/browser')
  return readExcelFile(file)
}

const PREVIEW_ROWS = 6

interface ImportRecord {
  fileName: string
  idPrefix: string
  sheets: { name: string; rows: string[][] }[]
  rows: RowState[] | null
  committed: boolean
}

/**
 * Server side of the Excel import for the mock: keeps uploads in memory and writes
 * committed rows into the given shipments and locations arrays.
 */
export function createImportStore(deps: { shipments: Shipment[]; locations: Location[]; readWorkbook: WorkbookReader }) {
  const { shipments, locations, readWorkbook } = deps
  const imports = new Map<number, ImportRecord>()
  let nextImportId = 1

  const existingIds = () => new Set(shipments.map((s) => s.externalId))

  function find(importId: number): ImportRecord {
    const record = imports.get(importId)
    if (!record) throw new ApiError({ title: 'Ne postoji', status: 404, detail: `Uvoz ${importId} ne postoji.` })
    return record
  }

  function mappedRows(record: ImportRecord): RowState[] {
    if (!record.rows) {
      throw new ApiError({ title: 'Mapiranje nije zadato', status: 409, detail: 'Prvo zadajte mapiranje kolona.' })
    }
    return record.rows
  }

  function findOrCreateLocation(place: PlaceGuess, corrected: boolean): number {
    const key = normalizePlaceName(place.name)
    const existing = locations.find(
      (l) => normalizePlaceName(l.name) === key && (l.postalCode ?? null) === place.postalCode,
    )
    if (existing) return existing.id

    const coordinates = geocode(place.name)
    const created: Location = {
      id: Math.max(0, ...locations.map((l) => l.id)) + 1,
      name: place.name,
      address: null,
      country: place.country,
      postalCode: place.postalCode,
      lat: coordinates?.[0] ?? null,
      lon: coordinates?.[1] ?? null,
      geocodeStatus: coordinates ? (corrected ? 'MANUAL' : 'OK') : 'FAILED',
    }
    locations.push(created)
    return created.id
  }

  return {
    async create(file: File): Promise<ImportCreated> {
      if (!/\.xlsx$/i.test(file.name)) {
        throw new ApiError({ title: 'Nepodržan tip fajla', status: 415, detail: 'Podržani su samo .xlsx fajlovi.' })
      }
      let workbook: Awaited<ReturnType<WorkbookReader>>
      try {
        workbook = await readWorkbook(file)
      } catch {
        throw new ApiError({
          title: 'Fajl nije pročitan',
          status: 400,
          detail: `„${file.name}“ nije moguće pročitati kao Excel (.xlsx) fajl.`,
        })
      }
      const sheets = workbook.map(({ sheet, data }) => ({ name: sheet, rows: data.map((row) => row.map(cellText)) }))
      const importId = nextImportId++
      imports.set(importId, {
        fileName: file.name,
        idPrefix: file.name.replace(/\.xlsx$/i, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'uvoz',
        sheets,
        rows: null,
        committed: false,
      })
      return {
        importId,
        fileName: file.name,
        sheets: sheets.map((s) => ({ name: s.name, rowCount: s.rows.length, previewRows: s.rows.slice(0, PREVIEW_ROWS) })),
      }
    },

    setMapping(importId: number, mapping: ImportMapping): void {
      const record = find(importId)
      const sheet = record.sheets.find((s) => s.name === mapping.sheetName)
      const errors = mappingErrors(mapping, sheet?.rows)
      if (!sheet || Object.keys(errors).length > 0) {
        throw new ApiError({ title: 'Neispravno mapiranje kolona', status: 400, errors: sheet ? errors : { sheetName: 'List ne postoji.' } })
      }
      record.rows = readRows(sheet.rows, mapping, record.idPrefix)
      record.committed = false
    },

    preview(importId: number): ImportPreview {
      const record = find(importId)
      return { importId, fileName: record.fileName, rows: toImportRows(mappedRows(record), existingIds()) }
    },

    updateRow(importId: number, rowNumber: number, patch: ImportRowPatch): ImportRow {
      const record = find(importId)
      const rows = mappedRows(record)
      const index = rows.findIndex((r) => r.rowNumber === rowNumber)
      if (index < 0) throw new ApiError({ title: 'Ne postoji', status: 404, detail: `Red ${rowNumber} ne postoji.` })
      if (patch.ldmTenths !== undefined && (!Number.isInteger(patch.ldmTenths) || patch.ldmTenths <= 0)) {
        throw new ApiError({ title: 'Neispravan red', status: 400, errors: { ldmTenths: 'LDM mora biti veći od 0.' } })
      }
      rows[index] = applyPatch(rows[index], patch)
      return toImportRows(rows, existingIds())[index]
    },

    commit(importId: number): ImportCommitResult {
      const record = find(importId)
      if (record.committed) {
        throw new ApiError({ title: 'Uvoz je već potvrđen', status: 409, detail: `Uvoz ${importId} je već upisan.` })
      }
      const rows = mappedRows(record)
      const views = toImportRows(rows, existingIds())
      let created = 0
      views.forEach((view, index) => {
        if (view.excluded || view.errors.length > 0 || !view.pickup || !view.delivery || view.ldmTenths === null) return
        shipments.push({
          id: Math.max(0, ...shipments.map((s) => s.id)) + 1,
          externalId: view.externalId,
          description: view.description,
          ldmTenths: view.ldmTenths,
          pickupLocationId: findOrCreateLocation(view.pickup, rows[index].corrected),
          deliveryLocationId: findOrCreateLocation(view.delivery, rows[index].corrected),
          splittable: false,
          weightKg: view.weightKg,
          lengthMm: null,
          widthMm: null,
          heightMm: null,
        })
        created++
      })
      record.committed = true
      return { created, skipped: views.length - created }
    },
  }
}

/** field -> message; empty when the mapping can be used */
export function mappingErrors(mapping: ImportMapping, sheetRows: string[][] | undefined): Record<string, string> {
  const errors: Record<string, string> = {}
  const { columns } = mapping
  const rowCount = sheetRows?.length ?? 0
  if (!Number.isInteger(mapping.headerRow) || mapping.headerRow < 1 || mapping.headerRow >= rowCount) {
    errors.headerRow = 'Red sa nazivima kolona mora postojati i ispod njega mora biti bar jedan red podataka.'
  }
  if (columns.ldm === undefined) errors.ldm = 'Kolona sa LDM je obavezna.'
  const separate = columns.pickup !== undefined || columns.delivery !== undefined
  if (columns.relation !== undefined && separate) {
    errors.relation = 'Izaberite ili kolonu Relacija ili kolone Preuzimanje i Isporuka, ne oboje.'
  } else if (columns.relation === undefined && (columns.pickup === undefined || columns.delivery === undefined)) {
    errors.relation = 'Potrebna je kolona Relacija ili obe kolone Preuzimanje i Isporuka.'
  }
  const used = Object.values(columns)
  if (new Set(used).size !== used.length) errors.columns = 'Ista kolona je izabrana za više polja.'
  return errors
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}
