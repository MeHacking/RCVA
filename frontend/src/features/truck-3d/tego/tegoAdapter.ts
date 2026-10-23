import type { Placement } from '../../../api/types'
import type { TegoMapping } from './tegoTypes'

// Our API: millimetres, x = along the cargo length, y = across (width), z = up.
// TeGo viewer: centimetres, x = length, y = up (height), z = width
// (same axis mapping as TeGo's mapJsonToViewerFormat). Placements already carry the
// dimensions as placed, so `rotated` needs no swap here.

export interface CargoSpaceMm {
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
}

/** Box in viewer units (cm, y up); `width` runs along x, `depth` along z. */
export interface ViewerBox {
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
}

export interface ViewerItem extends ViewerBox {
  shipmentId: number
  /** "0x..." as expected by TeGo's mapping (parsed with radix 16) */
  color: string
}

// Distinguishable fills on the light viewer background (taken from TeGo's default palette).
const COLORS = ['0xdf7126', '0x639bff', '0x6abe30', '0xd95763', '0x847eee', '0x37946e', '0xd9a066', '0x8f974a', '0x22f4f1', '0x8f563b']

/** Highlight for the selected / hovered shipment */
export const HIGHLIGHT_COLOR = 0x5e1a2e

const cm = (mm: number) => mm / 10

export function toViewerBin(space: CargoSpaceMm): ViewerBox {
  return { x: 0, y: 0, z: 0, width: cm(space.innerLengthMm), height: cm(space.innerHeightMm), depth: cm(space.innerWidthMm) }
}

export function toViewerItems(placements: Placement[]): ViewerItem[] {
  return placements.map((p, index) => ({
    shipmentId: p.shipmentId,
    x: cm(p.xMm),
    y: cm(p.zMm),
    z: cm(p.yMm),
    width: cm(p.lengthMm),
    height: cm(p.heightMm),
    depth: cm(p.widthMm),
    color: COLORS[index % COLORS.length],
  }))
}

/** Field mapping for mapItems / mapBins (same keys as TeGo's defaultMapping). */
export const VIEWER_MAPPING: TegoMapping = {
  x_start: ['x'],
  y_start: ['y'],
  z_start: ['z'],
  x_length: ['width'],
  y_length: ['height'],
  z_length: ['depth'],
  color: ['color'],
}

export const BIN_MAPPING: TegoMapping = { ...VIEWER_MAPPING, color: '0xff0000' }
