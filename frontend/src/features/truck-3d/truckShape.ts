// The truck drawn around a cargo space of L x W cm in the 3D view (Truck3D). Taken over from
// smartLoad (truckShape.ts, 17.11.2026), at the user's request. Positions are a
// drawing, not the real measures of a vehicle. x runs from the front of the cab; the cargo
// space starts at x0.
export interface TruckShape {
  /** a tractor with a semi-trailer (from 10 m), otherwise a rigid truck */
  semi: boolean
  /** how far the wheels stick out at the sides (cm) */
  wheelOut: number
  /** tyre diameter (cm) */
  tyre: number
  cabL: number
  /** the coupling between tractor and trailer, or the small step between cab and body */
  gap: number
  /** the front wall of the cargo space, from the front of the cab */
  x0: number
  total: number
  /** axle positions from the front of the cab */
  axles: number[]
  /** the floor of the cargo space above the ground, and the cab's height above the ground */
  deck: number
  cabH: number
}

export function truckShape(L: number): TruckShape {
  const semi = L >= 1000
  const cabL = semi ? 230 : 190
  const gap = semi ? 45 : 12
  const x0 = cabL + gap
  return {
    semi,
    wheelOut: 16,
    tyre: 100,
    cabL,
    gap,
    x0,
    total: x0 + L + 10, // + rear bumper
    axles: semi
      ? [100, x0 + 40, x0 + 170, x0 + L - 380, x0 + L - 250, x0 + L - 120] // cab front, drive pair, trailer triple
      : [90, x0 + L * 0.72],
    deck: semi ? 115 : 95,
    cabH: semi ? 330 : 290,
  }
}
