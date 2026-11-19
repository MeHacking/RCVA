// An invented layout file as smartLoad+ exports it ("Izvezi raspored (JSON)"): six pallets,
// three across and two along (2400 mm), and a crate on top of the first one.

export interface LayoutFileShape {
  format: unknown
  version: unknown
  exportedAt: unknown
  name: unknown
  units: unknown
  truck: Record<string, unknown>
  load: Record<string, unknown>
  goods: Array<Record<string, unknown>>
  placements: Array<Record<string, unknown>>
  unplaced: Array<Record<string, unknown>>
}

export function layoutFile(): LayoutFileShape {
  const pallets = [0, 1200].flatMap((x) =>
    [0, 800, 1600].map((y) => ({ x, y })),
  )
  return {
    format: 'smartload.layout',
    version: 1,
    exportedAt: '2026-11-19T10:15:00.000Z',
    name: '2,4 LDM - Proba',
    units: 'mm',
    truck: { name: 'Standardna cerada', innerLengthMm: 13600, innerWidthMm: 2480, innerHeightMm: 2700, maxWeightKg: 24000 },
    load: { lengthMm: 2400, ldm: 2.4, widthMm: 2400, heightMm: 1600, weightKg: 2140, pieces: 7, piecesRequested: 8 },
    goods: [
      {
        id: 'g-1',
        name: 'Europaleta',
        client: 'Klijent A',
        loadingAddress: '',
        unloadingAddress: 'Mesto B',
        unloadOrder: null,
        lengthMm: 1200,
        widthMm: 800,
        heightMm: 1100,
        weightKg: 350,
        quantity: 6,
        color: '#3b6fb6',
      },
      {
        id: 'g-2',
        name: 'Sanduk',
        client: '',
        loadingAddress: '',
        unloadingAddress: '',
        unloadOrder: 1,
        lengthMm: 1000,
        widthMm: 600,
        heightMm: 500,
        weightKg: 40,
        quantity: 2,
        color: '#c0392b',
      },
    ],
    placements: [
      ...pallets.map(({ x, y }, i) => ({
        goodsId: 'g-1',
        piece: i + 1,
        xMm: x,
        yMm: y,
        zMm: 0,
        lengthMm: 1200,
        widthMm: 800,
        heightMm: 1100,
        rotated: false,
        weightKg: 350,
      })),
      { goodsId: 'g-2', piece: 1, xMm: 0, yMm: 0, zMm: 1100, lengthMm: 600, widthMm: 1000, heightMm: 500, rotated: true, weightKg: 40 },
    ],
    unplaced: [{ goodsId: 'g-2', quantity: 1 }],
  }
}

export const layoutText = (change: (file: LayoutFileShape) => void = () => {}): string => {
  const file = layoutFile()
  change(file)
  return JSON.stringify(file)
}
