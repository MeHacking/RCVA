// The application makes the fleet itself (process owner's answer B1): "Kamion 1",
// "Kamion 2"..., all standard curtain-siders; the user renames them and changes their
// dimensions later.

/**
 * Standard curtain-sider (cerada). capacityKg is the process owner's "I think 13 tonnes",
 * not yet confirmed (about 24 t is usual for a 13,6 m trailer).
 */
export const STANDARD_TRUCK = {
  capacityLdmTenths: 136,
  capacityKg: 13_000,
  innerLengthMm: 13_600,
  innerWidthMm: 2_480,
  innerHeightMm: 2_700,
} as const

export interface FleetTruck {
  id: number
  name: string
  capacityLdmTenths: number
  capacityKg: number
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
}

/**
 * `count` standard trucks with ids 1..count. One per shipment is always enough when each
 * shipment fits a standard truck; the solver then uses as few of them as it can.
 */
export function standardFleet(count: number): FleetTruck[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `Kamion ${i + 1}`, ...STANDARD_TRUCK }))
}
