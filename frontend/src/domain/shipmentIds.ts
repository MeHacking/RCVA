import type { Location, Shipment } from '../api/types'

// Short names for shipments the Excel file gives no ID of their own: the first letters of
// where a shipment is loaded and unloaded, and a number ("KRA-STE-1": Kragujevac ->
// Stenkullen). Chosen by the user 08.11.2026 over "file name + row" ("Relacija-...-14").

/** "Kragujevac" -> "KRA", "Šabac" -> "SAB", "Beograd – magacin" -> "BEO"; without letters "X" */
export function placeCode(name: string | null | undefined): string {
  const letters = (name ?? '')
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[^\p{L}]/gu, '')
  return letters.slice(0, 3).toUpperCase() || 'X'
}

/** The first "PICK-DROP-n" no shipment has yet; the new name is added to `taken`. */
export function relationId(pickup: string | null | undefined, delivery: string | null | undefined, taken: Set<string>): string {
  const base = `${placeCode(pickup)}-${placeCode(delivery)}`
  let n = 1
  while (taken.has(`${base}-${n}`)) n++
  const id = `${base}-${n}`
  taken.add(id)
  return id
}

// What the import used to make before 08.11.2026: the file name as letters and digits
// joined with dashes, then the row number ("Relacija-tezina-dimenzija-14").
const FILE_NAME_ID = /^([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*)-(\d+)$/u
// A short name already: "KRA-STE".
const RELATION = /^\p{L}{1,3}-\p{L}{1,3}$/u

/**
 * An ID that looks made by an earlier import from the file name and the row. A guess (an
 * ID typed in Excel can look the same), so the user confirms before anything is renamed.
 */
export function looksLikeFileNameId(externalId: string): boolean {
  const match = FILE_NAME_ID.exec(externalId)
  if (!match) return false
  const prefix = match[1]
  return prefix.length >= 6 && /\p{L}/u.test(prefix) && !RELATION.test(prefix)
}

export interface IdRename {
  shipmentId: number
  from: string
  to: string
}

/** Renames them in place (the API's shortenShipmentIds); how many. */
export function shortenIds(shipments: Shipment[], locations: Location[]): number {
  const renames = fileNameIdRenames(shipments, locations)
  for (const { shipmentId, to } of renames) {
    const index = shipments.findIndex((s) => s.id === shipmentId)
    shipments[index] = { ...shipments[index], externalId: to }
  }
  return renames.length
}

/** The shipments with such an ID and the short name each gets, in the order of their ids. */
export function fileNameIdRenames(shipments: Shipment[], locations: Location[]): IdRename[] {
  const names = new Map(locations.map((l) => [l.id, l.name]))
  const renamed = shipments.filter((s) => looksLikeFileNameId(s.externalId)).sort((a, b) => a.id - b.id)
  const taken = new Set(shipments.filter((s) => !renamed.includes(s)).map((s) => s.externalId))
  return renamed.map((s) => ({
    shipmentId: s.id,
    from: s.externalId,
    to: relationId(names.get(s.pickupLocationId), names.get(s.deliveryLocationId), taken),
  }))
}
