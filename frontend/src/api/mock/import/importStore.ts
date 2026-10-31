import { ApiError } from '../../client'
import type {
  ImportCommitProgress,
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
import { applyPatch, gazetteerWarning, readRows, toImportRows, type PlaceWarning, type RowState } from './importRows'

/** Coordinates of one place, looked up when an import is committed. */
export type PlaceLocator = (place: PlaceGuess) => Promise<LocateResult>
export type LocateResult =
  | { kind: 'found'; lat: number; lon: number }
  | { kind: 'notFound' }
  | { kind: 'failed'; message: string }

/** The mock's stand-in: only the gazetteer's places are found. */
export const locateInGazetteer: PlaceLocator = async (place) => {
  const coordinates = geocode(place.name)
  return coordinates ? { kind: 'found', lat: coordinates[0], lon: coordinates[1] } : { kind: 'notFound' }
}

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
  /** a commit is waiting for coordinates */
  committing: boolean
}

/**
 * Server side of the Excel import for the mock: keeps uploads in memory and writes
 * committed rows into the given shipments and locations arrays. Places get their
 * coordinates when the import is committed: new places, and known places that still have
 * none (so a failed lookup is tried again on the next import).
 */
export function createImportStore(deps: {
  shipments: Shipment[]
  locations: Location[]
  readWorkbook: WorkbookReader
  locate?: PlaceLocator
  /** the warning shown in the preview for a place known to have no coordinates */
  placeWarning?: PlaceWarning
}) {
  const { shipments, locations, readWorkbook, locate = locateInGazetteer, placeWarning = gazetteerWarning } = deps
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

  function findLocation(place: PlaceGuess): Location | undefined {
    const key = normalizePlaceName(place.name)
    return locations.find((l) => normalizePlaceName(l.name) === key && (l.postalCode ?? null) === place.postalCode)
  }

  function findOrCreateLocation(place: PlaceGuess, corrected: boolean, located: Map<string, LocateResult>): number {
    const result = located.get(placeId(place))
    const coordinates = result?.kind === 'found' ? result : null
    const geocodeStatus = coordinates ? (corrected ? 'MANUAL' : 'OK') : 'FAILED'
    const existing = findLocation(place)
    if (existing) {
      if (coordinates && (existing.lat === null || existing.lon === null)) {
        Object.assign(existing, { lat: coordinates.lat, lon: coordinates.lon, geocodeStatus })
      }
      return existing.id
    }
    const created: Location = {
      id: Math.max(0, ...locations.map((l) => l.id)) + 1,
      name: place.name,
      address: null,
      country: place.country,
      postalCode: place.postalCode,
      lat: coordinates?.lat ?? null,
      lon: coordinates?.lon ?? null,
      geocodeStatus,
    }
    locations.push(created)
    return created.id
  }

  /**
   * Looks up, one after another, every place of the rows that has no coordinates yet.
   * After a failed lookup the rest are not asked: the service is not answering.
   */
  async function locatePlaces(places: PlaceGuess[], onProgress?: (progress: ImportCommitProgress) => void) {
    const pending = new Map<string, PlaceGuess>()
    for (const place of places) {
      const known = findLocation(place)
      if (!known || known.lat === null || known.lon === null) pending.set(placeId(place), place)
    }
    const located = new Map<string, LocateResult>()
    const summary = { found: 0, notFound: 0, failed: 0, message: null as string | null }
    let failure: LocateResult | null = null
    onProgress?.({ done: 0, total: pending.size })
    for (const [id, place] of pending) {
      const result: LocateResult = failure ?? (await locate(place))
      if (result.kind === 'failed') failure = result
      located.set(id, result)
      if (result.kind === 'found') summary.found++
      else if (result.kind === 'notFound') summary.notFound++
      else {
        summary.failed++
        summary.message ??= result.message
      }
      onProgress?.({ done: located.size, total: pending.size })
    }
    return { located, summary }
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
        committing: false,
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
      return { importId, fileName: record.fileName, rows: toImportRows(mappedRows(record), existingIds(), placeWarning) }
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
      return toImportRows(rows, existingIds(), placeWarning)[index]
    },

    async commit(importId: number, onProgress?: (progress: ImportCommitProgress) => void): Promise<ImportCommitResult> {
      const record = find(importId)
      if (record.committed) {
        throw new ApiError({ title: 'Uvoz je već potvrđen', status: 409, detail: `Uvoz ${importId} je već upisan.` })
      }
      if (record.committing) {
        throw new ApiError({ title: 'Uvoz se upisuje', status: 409, detail: `Uvoz ${importId} se upravo upisuje.` })
      }
      const rows = mappedRows(record)
      const places = toImportRows(rows, existingIds(), placeWarning)
        .filter(writable)
        .flatMap((view) => [view.pickup as PlaceGuess, view.delivery as PlaceGuess])
      record.committing = true
      let geocoding: Awaited<ReturnType<typeof locatePlaces>>
      try {
        geocoding = await locatePlaces(places, onProgress)
      } finally {
        record.committing = false
      }
      // Read again after the lookup, so the rows are checked against the shipments as they are now.
      const views = toImportRows(rows, existingIds(), placeWarning)
      let created = 0
      views.forEach((view, index) => {
        if (!writable(view) || !view.pickup || !view.delivery || view.ldmTenths === null) return
        shipments.push({
          id: Math.max(0, ...shipments.map((s) => s.id)) + 1,
          externalId: view.externalId,
          description: view.description,
          ldmTenths: view.ldmTenths,
          pickupLocationId: findOrCreateLocation(view.pickup, rows[index].corrected, geocoding.located),
          deliveryLocationId: findOrCreateLocation(view.delivery, rows[index].corrected, geocoding.located),
          splittable: false,
          weightKg: view.weightKg,
          lengthMm: null,
          widthMm: null,
          heightMm: null,
        })
        created++
      })
      record.committed = true
      return { created, skipped: views.length - created, geocoding: geocoding.summary }
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

/** A row that is written on commit. */
function writable(view: ImportRow): boolean {
  return !view.excluded && view.errors.length === 0 && !!view.pickup && !!view.delivery && view.ldmTenths !== null
}

/** The same place in the rows of an import: same name (written any way) and postal code. */
function placeId(place: PlaceGuess): string {
  return `${normalizePlaceName(place.name)}|${place.postalCode ?? ''}`
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}
