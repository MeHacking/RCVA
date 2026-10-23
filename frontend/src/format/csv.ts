export type CsvCell = string | number | null

/**
 * CSV for Excel with Serbian regional settings: ';' as separator (the decimal comma is
 * already taken), CRLF line endings. Cells are quoted only when needed.
 * Prepend CSV_BOM when saving so Excel reads the file as UTF-8 (š, ć, ž...).
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n'
}

export const CSV_BOM = '﻿'

function cell(value: CsvCell): string {
  if (value === null) return ''
  const text = String(value)
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
