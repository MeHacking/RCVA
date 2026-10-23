import type { ImportMapping, ImportRow, ImportRowPatch, PlaceGuess } from '../../types'
import { geocode } from './gazetteer'
import { parseRelation, parsePlace } from './parseRelation'
import { parseLdmCell, parseWeight } from './parseQuantities'

/** Server-side state of one row: parsed values plus what validation needs to recompute. */
export interface RowState {
  rowNumber: number
  sourceText: string
  externalId: string
  pickup: PlaceGuess | null
  delivery: PlaceGuess | null
  ldmTenths: number | null
  /** the LDM cell as written, for the error message */
  ldmRaw: string
  weightKg: number | null
  weightWarning: string | null
  description: string | null
  /** problems found in the relation text; cleared when places are corrected by hand */
  placeIssues: string[]
  excluded: boolean
  corrected: boolean
}

/** Reads data rows below the header row. Fully empty rows are skipped. */
export function readRows(sheetRows: string[][], mapping: ImportMapping, idPrefix: string): RowState[] {
  const result: RowState[] = []
  sheetRows.forEach((cells, index) => {
    const rowNumber = index + 1
    if (rowNumber <= mapping.headerRow || cells.every((c) => c.trim() === '')) return

    const cell = (field: keyof ImportMapping['columns']): string | null => {
      const column = mapping.columns[field]
      return column === undefined ? null : (cells[column] ?? '').trim()
    }

    let pickup: PlaceGuess | null
    let delivery: PlaceGuess | null
    let placeIssues: string[] = []
    let sourceText: string
    const postalCell = cell('deliveryPostalCode') || null
    const relation = cell('relation')
    if (relation !== null) {
      const parsed = parseRelation(relation)
      pickup = parsed.pickup
      delivery = parsed.delivery && postalCell && !parsed.delivery.postalCode ? { ...parsed.delivery, postalCode: postalCell } : parsed.delivery
      placeIssues = parsed.issues
      sourceText = relation
    } else {
      const pickupText = cell('pickup') ?? ''
      const deliveryText = cell('delivery') ?? ''
      pickup = parsePlace(pickupText, null)
      delivery = parsePlace(deliveryText, postalCell)
      sourceText = `${pickupText} → ${deliveryText}`
    }

    const ldmRaw = cell('ldm') ?? ''
    const weight = parseWeight(cell('weight') ?? '')
    result.push({
      rowNumber,
      sourceText,
      externalId: cell('externalId') || `${idPrefix}-${rowNumber}`,
      pickup,
      delivery,
      ldmTenths: parseLdmCell(ldmRaw),
      ldmRaw,
      weightKg: weight.kg,
      weightWarning: weight.warning,
      description: cell('description') || null,
      placeIssues,
      excluded: false,
      corrected: false,
    })
  })
  return result
}

/** Validates all rows together, since duplicate IDs depend on the other rows. */
export function toImportRows(rows: RowState[], existingIds: ReadonlySet<string>): ImportRow[] {
  const rowsById = new Map<string, number[]>()
  for (const row of rows.filter((r) => !r.excluded)) {
    rowsById.set(row.externalId, [...(rowsById.get(row.externalId) ?? []), row.rowNumber])
  }

  return rows.map((row) => {
    const errors = [...row.placeIssues]
    const warnings: string[] = []

    if (!row.pickup?.name) errors.push('Nedostaje mesto preuzimanja.')
    if (!row.delivery?.name) errors.push('Nedostaje mesto isporuke.')
    if (row.ldmTenths === null) {
      errors.push(row.ldmRaw ? `LDM „${row.ldmRaw}“ nije prepoznat (primer: 2,4 ili 2,4m).` : 'Nedostaje LDM.')
    } else if (row.ldmTenths <= 0) {
      errors.push('LDM mora biti veći od 0.')
    }

    const sameId = rowsById.get(row.externalId) ?? []
    if (!row.excluded && sameId.length > 1) {
      errors.push(`ID „${row.externalId}“ se ponavlja u redovima ${sameId.join(', ')}.`)
    }
    if (existingIds.has(row.externalId)) errors.push(`ID „${row.externalId}“ već postoji među pošiljkama.`)

    if (row.weightWarning) warnings.push(row.weightWarning)
    for (const place of [row.pickup, row.delivery]) {
      if (place?.name && !geocode(place.name)) {
        warnings.push(`„${place.name}“ nije pronađeno pri probnom geokodiranju; pošiljka će imati status „Nejasna lokacija“.`)
      }
    }

    return {
      rowNumber: row.rowNumber,
      sourceText: row.sourceText,
      externalId: row.externalId,
      pickup: row.pickup,
      delivery: row.delivery,
      ldmTenths: row.ldmTenths,
      weightKg: row.weightKg,
      description: row.description,
      errors,
      warnings,
      excluded: row.excluded,
      corrected: row.corrected,
    }
  })
}

export function applyPatch(row: RowState, patch: ImportRowPatch): RowState {
  const next: RowState = { ...row }
  if (patch.excluded !== undefined) next.excluded = patch.excluded

  const edits = patch.externalId !== undefined || patch.pickup || patch.delivery || patch.ldmTenths !== undefined
  if (!edits) return next

  next.corrected = true
  if (patch.externalId !== undefined) next.externalId = patch.externalId.trim()
  if (patch.pickup || patch.delivery) {
    // The relation text no longer decides the places, so its problems no longer apply.
    next.placeIssues = []
    if (patch.pickup) next.pickup = cleanPlace(patch.pickup)
    if (patch.delivery) next.delivery = cleanPlace(patch.delivery)
  }
  if (patch.ldmTenths !== undefined) {
    next.ldmTenths = patch.ldmTenths
    next.ldmRaw = String(patch.ldmTenths)
  }
  return next
}

function cleanPlace(place: PlaceGuess): PlaceGuess | null {
  const name = place.name.trim()
  if (!name) return null
  return { name, postalCode: place.postalCode?.trim() || null, country: place.country?.trim().toUpperCase() || null }
}
