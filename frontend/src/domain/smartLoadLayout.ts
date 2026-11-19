import type { LayoutPiece, ShipmentLayout } from '../api/types'

// A layout file exported from smartLoad+ (the owner's other application; "Izvezi raspored
// (JSON)"), format "smartload.layout", version 1. It holds where every piece of one load
// stands, measured in mm from the start of the load (not from the front wall), with the same
// axes as Placement: x from the front wall to the doors, y across, z up. RCVA puts such a
// layout in place of one shipment's block.
//
// The whole file is checked before anything is used; the message names the first broken
// value. Only what RCVA needs is kept: the client and the addresses stay in the file.

export const LAYOUT_FILE_FORMAT = 'smartload.layout'
export const LAYOUT_FILE_VERSION = 1
/** smartLoad+ measures to the millimetre; a piece may reach this far past the occupied length */
const TOLERANCE_MM = 1

export class LayoutFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LayoutFileError'
  }
}

const FROM = 'izaberite fajl koji je napravilo „Izvezi raspored (JSON)“ u smartLoad+'

export function readLayoutFile(text: string): ShipmentLayout {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    throw new LayoutFileError(`Fajl nije JSON; ${FROM}.`)
  }
  if (!isObject(file) || file.format !== LAYOUT_FILE_FORMAT) {
    throw new LayoutFileError(`Ovo nije raspored iz smartLoad+; ${FROM}.`)
  }
  if (file.version !== LAYOUT_FILE_VERSION) {
    throw new LayoutFileError(
      `Raspored je u formatu ${String(file.version)}, a RCVA zna samo format ${LAYOUT_FILE_VERSION}; ` +
        'možda ga je napravila novija verzija smartLoad+.',
    )
  }
  if (file.units !== 'mm') throw new LayoutFileError(`Mere u rasporedu nisu u milimetrima (units: ${String(file.units)}).`)
  FILE(file, 'raspored')
  const { name, exportedAt, load, goods, placements, unplaced } = file as unknown as LayoutFile

  const names = new Map<string, string>()
  goods.forEach((g, i) => {
    if (names.has(g.id)) throw new LayoutFileError(`Raspored je oštećen: roba „${g.id}“ (goods[${i}]) se ponavlja.`)
    names.set(g.id, g.name)
  })
  if (placements.length === 0) throw new LayoutFileError('Raspored nema nijedan utovaren komad.')
  const pieces = placements.map((p, i): LayoutPiece => {
    const goodsName = names.get(p.goodsId)
    if (goodsName === undefined) {
      throw new LayoutFileError(`Raspored je oštećen: placements[${i}] pokazuje na robu „${p.goodsId}“, koje nema u goods.`)
    }
    if (p.xMm + p.lengthMm > load.lengthMm + TOLERANCE_MM) {
      throw new LayoutFileError(
        `Raspored je oštećen: komad placements[${i}] seže do ${p.xMm + p.lengthMm} mm, a utovar je dug ${load.lengthMm} mm.`,
      )
    }
    return {
      goods: goodsName,
      xMm: p.xMm,
      yMm: p.yMm,
      zMm: p.zMm,
      lengthMm: p.lengthMm,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      rotated: p.rotated,
      weightKg: p.weightKg,
    }
  })
  unplaced.forEach((u, i) => {
    if (!names.has(u.goodsId)) {
      throw new LayoutFileError(`Raspored je oštećen: unplaced[${i}] pokazuje na robu „${u.goodsId}“, koje nema u goods.`)
    }
  })
  return {
    name,
    exportedAt,
    lengthMm: load.lengthMm,
    // How far the pieces reach, whatever the file says the load takes: that is what must fit the truck.
    widthMm: Math.max(...pieces.map((p) => p.yMm + p.widthMm)),
    heightMm: Math.max(...pieces.map((p) => p.zMm + p.heightMm)),
    weightKg: load.weightKg,
    pieces,
    unplacedPieces: unplaced.reduce((sum, u) => sum + u.quantity, 0),
  }
}

/** The LDM (tenths) a shipment takes with this layout: its occupied length, rounded up (1 LDM = 1000 mm). */
export function layoutLdmTenths(layout: Pick<ShipmentLayout, 'lengthMm'>): number {
  return Math.ceil(Math.round(layout.lengthMm) / 100)
}

// ---- The shape of the file: each check throws with the path of the first broken value. ----

interface LayoutFile {
  name: string
  exportedAt: string
  load: { lengthMm: number; weightKg: number }
  goods: Array<{ id: string; name: string }>
  placements: Array<{
    goodsId: string
    xMm: number
    yMm: number
    zMm: number
    lengthMm: number
    widthMm: number
    heightMm: number
    rotated: boolean
    weightKg: number
  }>
  unplaced: Array<{ goodsId: string; quantity: number }>
}

type Check = (value: unknown, path: string) => void

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function broken(path: string, expected: string): never {
  throw new LayoutFileError(`Raspored je oštećen: ${path} nije ${expected}.`)
}

const STR: Check = (v, p) => typeof v === 'string' || broken(p, 'tekst')
const BOOL: Check = (v, p) => typeof v === 'boolean' || broken(p, 'da/ne')
/** A measure: a finite number, at least 0 (or above 0). */
const MM: Check = (v, p) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) || broken(p, 'broj 0 ili veći')
const SIZE: Check = (v, p) => (typeof v === 'number' && Number.isFinite(v) && v > 0) || broken(p, 'broj veći od 0')
const COUNT: Check = (v, p) => (Number.isInteger(v) && (v as number) >= 0) || broken(p, 'ceo broj 0 ili veći')
const arrayOf = (check: Check): Check => (v, p) => {
  if (!Array.isArray(v)) broken(p, 'spisak')
  v.forEach((item, i) => check(item, `${p}[${i}]`))
}
const object = (fields: Record<string, Check>): Check => (v, p) => {
  if (!isObject(v)) broken(p, 'objekat')
  for (const [name, check] of Object.entries(fields)) check(v[name], `${p}.${name}`)
}

const FILE = object({
  name: STR,
  exportedAt: STR,
  load: object({ lengthMm: SIZE, weightKg: MM }),
  goods: arrayOf(object({ id: STR, name: STR })),
  placements: arrayOf(
    object({
      goodsId: STR,
      xMm: MM,
      yMm: MM,
      zMm: MM,
      lengthMm: SIZE,
      widthMm: SIZE,
      heightMm: SIZE,
      rotated: BOOL,
      weightKg: MM,
    }),
  ),
  unplaced: arrayOf(object({ goodsId: STR, quantity: COUNT })),
})
