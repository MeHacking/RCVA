import { describe, expect, it } from 'vitest'
import { layoutLdmTenths, LayoutFileError, readLayoutFile } from '../../src/domain/smartLoadLayout'
import { layoutText, type LayoutFileShape } from './layoutFile'

function readError(text: string): string {
  try {
    readLayoutFile(text)
  } catch (error) {
    expect(error).toBeInstanceOf(LayoutFileError)
    return (error as Error).message
  }
  throw new Error('The file was read')
}

describe('readLayoutFile', () => {
  it('keeps the pieces as they are, from the start of the load, with the goods by name', () => {
    const layout = readLayoutFile(layoutText())
    expect(layout).toMatchObject({
      name: '2,4 LDM - Proba',
      exportedAt: '2026-11-19T10:15:00.000Z',
      lengthMm: 2400,
      widthMm: 2400,
      // the crate on a pallet: 1100 + 500
      heightMm: 1600,
      weightKg: 2140,
      unplacedPieces: 1,
    })
    expect(layout.pieces).toHaveLength(7)
    expect(layout.pieces[4]).toEqual({
      goods: 'Europaleta',
      xMm: 1200,
      yMm: 800,
      zMm: 0,
      lengthMm: 1200,
      widthMm: 800,
      heightMm: 1100,
      rotated: false,
      weightKg: 350,
    })
    expect(layout.pieces[6]).toMatchObject({ goods: 'Sanduk', zMm: 1100, lengthMm: 600, widthMm: 1000, rotated: true })
    // Nothing of the client or the addresses is kept.
    expect(JSON.stringify(layout)).not.toContain('Klijent')
  })

  it('measures width and height by the pieces, not by what the file says the load takes', () => {
    const layout = readLayoutFile(
      layoutText((f) => {
        f.load.widthMm = 9999
        f.load.heightMm = 1
        f.placements[5].yMm = 1700
      }),
    )
    expect(layout.widthMm).toBe(2500)
    expect(layout.heightMm).toBe(1600)
  })

  it.each<[string, (f: LayoutFileShape) => void, string]>([
    ['another format', (f) => (f.format = 'rcva-podaci'), 'Ovo nije raspored iz smartLoad+'],
    ['a newer version', (f) => (f.version = 2), 'Raspored je u formatu 2, a RCVA zna samo format 1'],
    ['other units', (f) => (f.units = 'cm'), 'Mere u rasporedu nisu u milimetrima (units: cm)'],
    ['no name', (f) => delete (f as Partial<LayoutFileShape>).name, 'raspored.name nije tekst'],
    ['no load length', (f) => (f.load.lengthMm = 0), 'raspored.load.lengthMm nije broj veći od 0'],
    ['no weight', (f) => (f.load.weightKg = null), 'raspored.load.weightKg nije broj 0 ili veći'],
    ['goods without id', (f) => (f.goods[1].id = 7), 'raspored.goods[1].id nije tekst'],
    ['a piece below the floor', (f) => (f.placements[2].zMm = -1), 'raspored.placements[2].zMm nije broj 0 ili veći'],
    ['a flat piece', (f) => (f.placements[3].heightMm = 0), 'raspored.placements[3].heightMm nije broj veći od 0'],
    ['rotated as text', (f) => (f.placements[0].rotated = 'ne'), 'raspored.placements[0].rotated nije da/ne'],
    ['placements missing', (f) => delete (f as Partial<LayoutFileShape>).placements, 'raspored.placements nije spisak'],
    ['half a piece left over', (f) => (f.unplaced[0].quantity = 0.5), 'raspored.unplaced[0].quantity nije ceo broj 0 ili veći'],
    ['the same goods twice', (f) => (f.goods[1].id = 'g-1'), 'roba „g-1“ (goods[1]) se ponavlja'],
    ['a piece of unknown goods', (f) => (f.placements[6].goodsId = 'g-9'), 'placements[6] pokazuje na robu „g-9“'],
    ['left over of unknown goods', (f) => (f.unplaced[0].goodsId = 'g-9'), 'unplaced[0] pokazuje na robu „g-9“'],
    ['no piece loaded', (f) => (f.placements = []), 'Raspored nema nijedan utovaren komad.'],
    ['a piece past the load', (f) => (f.placements[5].xMm = 1202), 'komad placements[5] seže do 2402 mm, a utovar je dug 2400 mm'],
  ])('refuses %s', (_, change, message) => {
    expect(readError(layoutText(change))).toContain(message)
  })

  it('allows a piece a millimetre past the load (rounding in smartLoad+)', () => {
    expect(readLayoutFile(layoutText((f) => (f.placements[5].xMm = 1201))).pieces).toHaveLength(7)
  })

  it('refuses what is not JSON or not an object', () => {
    expect(readError('{')).toContain('Fajl nije JSON')
    expect(readError('[1]')).toContain('Ovo nije raspored iz smartLoad+')
    expect(readError('null')).toContain('Ovo nije raspored iz smartLoad+')
  })
})

describe('layoutLdmTenths', () => {
  it('rounds the occupied length up to a tenth of LDM', () => {
    expect(layoutLdmTenths({ lengthMm: 2400 })).toBe(24)
    expect(layoutLdmTenths({ lengthMm: 2401 })).toBe(25)
    expect(layoutLdmTenths({ lengthMm: 2399.6 })).toBe(24)
    expect(layoutLdmTenths({ lengthMm: 1 })).toBe(1)
  })
})
