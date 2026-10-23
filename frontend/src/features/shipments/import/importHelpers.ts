import type { ImportField, ImportMapping, ImportRow } from '../../../api/types'

export const IMPORT_FIELDS: ReadonlyArray<{ field: ImportField; label: string; hint: string }> = [
  { field: 'relation', label: 'Relacija', hint: 'Preuzimanje i isporuka u jednoj koloni, npr. „NOVI SAD 34131 - LJUNGBY“' },
  { field: 'pickup', label: 'Preuzimanje', hint: 'Umesto relacije: posebna kolona sa mestom preuzimanja' },
  { field: 'delivery', label: 'Isporuka', hint: 'Umesto relacije: posebna kolona sa mestom isporuke' },
  { field: 'deliveryPostalCode', label: 'Poštanski broj isporuke', hint: 'Opciono, ako nije deo relacije' },
  { field: 'ldm', label: 'LDM', hint: 'Obavezno; npr. „2,4m“ ili „2,4“' },
  { field: 'weight', label: 'Težina', hint: 'Opciono, informativno; npr. „4,200 kg“ ili „5,3t“' },
  { field: 'externalId', label: 'ID pošiljke', hint: 'Opciono; bez njega ID se pravi od imena fajla i broja reda' },
  { field: 'description', label: 'Opis robe', hint: 'Opciono' },
]

// Header keywords, checked in this order (LDM before "utovar", which also matches pickup).
const KEYWORDS: ReadonlyArray<[ImportField, RegExp]> = [
  ['relation', /RELACIJ|RELATION|RUTA/],
  ['ldm', /LDM|DIMENZIJ|UTOVARNI ?MET|LOADING ?MET/],
  ['weight', /TEZIN|WEIGHT|MASA|KG/],
  ['deliveryPostalCode', /POSTANSKI|ZIP|POSTAL|^PB$/],
  ['pickup', /PREUZIM|UTOVAR|POLAZ|PICKUP|ORIGIN/],
  ['delivery', /ISPORUK|ISTOVAR|ODREDIST|DELIVERY|DESTINATION/],
  ['externalId', /^ID$|SIFRA|BROJ POSILJKE|SHIPMENT ?ID/],
  ['description', /OPIS|ROBA|DESCRIPTION/],
]

/** Guesses the mapping from column names; every field gets at most one column and vice versa. */
export function suggestMapping(headers: string[]): ImportMapping['columns'] {
  const columns: ImportMapping['columns'] = {}
  const taken = new Set<number>()
  for (const [field, pattern] of KEYWORDS) {
    const index = headers.findIndex((header, i) => !taken.has(i) && pattern.test(normalizeHeader(header)))
    if (index >= 0) {
      columns[field] = index
      taken.add(index)
    }
  }
  // A relation column makes separate pickup/delivery columns unnecessary.
  if (columns.relation !== undefined) {
    delete columns.pickup
    delete columns.delivery
  }
  return columns
}

/** "A", "B", ... "Z", "AA" like in Excel */
export function columnLetter(index: number): string {
  let n = index + 1
  let letters = ''
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

export interface ImportSummary {
  total: number
  /** written on commit: not excluded and without errors */
  ready: number
  withErrors: number
  excluded: number
  corrected: number
}

export function summarizeImport(rows: ImportRow[]): ImportSummary {
  const active = rows.filter((r) => !r.excluded)
  return {
    total: rows.length,
    ready: active.filter((r) => r.errors.length === 0).length,
    withErrors: active.filter((r) => r.errors.length > 0).length,
    excluded: rows.length - active.length,
    corrected: rows.filter((r) => r.corrected).length,
  }
}

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'dj')
    .toUpperCase()
    .trim()
}
