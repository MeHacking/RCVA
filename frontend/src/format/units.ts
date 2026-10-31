// Single place for converting API units (integers) to display strings and back.
// API units: LDM x 10 (`ldmTenths`), distances in metres, dimensions in mm.
// Display uses a decimal comma, as in the specification ("13,6 LDM", "1001,5 km").

/** 136 -> "13,6" */
export function formatLdm(ldmTenths: number): string {
  return formatTenths(ldmTenths)
}

/** 1001489 -> "1001,5 km" (rounded to 0.1 km, half away from zero) */
export function formatKm(meters: number): string {
  const tenthsOfKm = Math.sign(meters) * Math.round(Math.abs(meters) / 100)
  return `${formatTenths(tenthsOfKm)} km`
}

/** 3200 -> "3200", 1.5 -> "1,5" (weight in kg, decimal comma) */
export function formatKg(kg: number): string {
  return String(kg).replace('.', ',')
}

/** (13600, 2480, 2700) -> "13600 × 2480 × 2700 mm"; null when any dimension is missing */
export function formatDimensionsMm(
  lengthMm: number | null,
  widthMm: number | null,
  heightMm: number | null,
): string | null {
  if (lengthMm === null || widthMm === null || heightMm === null) return null
  return `${lengthMm} × ${widthMm} × ${heightMm} mm`
}

/** Timefold score notation: "0hard/-2medium/-1001489soft" */
export function formatScore(hard: number, medium: number, soft: number): string {
  return `${hard}hard/${medium}medium/${soft}soft`
}

/** used / capacity as a whole percentage: (134, 136) -> "99 %" */
export function formatUtilization(usedLdmTenths: number, capacityLdmTenths: number): string {
  if (capacityLdmTenths <= 0) return '–'
  return `${Math.round((usedLdmTenths / capacityLdmTenths) * 100)} %`
}

/**
 * Parses user input in LDM ("13,6", "13.6", "7") into LDM x 10.
 * Returns null for anything that is not a non-negative number with at most one decimal.
 */
export function parseLdmTenths(input: string): number | null {
  const match = /^(\d+)(?:[.,](\d))?$/.exec(input.trim())
  if (!match) return null
  return Number(match[1]) * 10 + Number(match[2] ?? '0')
}

/** Parses a positive whole number of kilograms; empty input is "not given" (null). */
export function parseKg(input: string): number | null | 'invalid' {
  return parseMm(input)
}

/** Parses a positive whole number of millimetres; empty input is "not given" (null). */
export function parseMm(input: string): number | null | 'invalid' {
  const trimmed = input.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return 'invalid'
  const value = Number(trimmed)
  return value > 0 ? value : 'invalid'
}

function formatTenths(tenths: number): string {
  const sign = tenths < 0 ? '-' : ''
  const abs = Math.abs(tenths)
  return `${sign}${Math.trunc(abs / 10)},${abs % 10}`
}
