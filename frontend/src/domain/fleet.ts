// The application makes the fleet itself (process owner's answer B1): "Kamion 1",
// "Kamion 2"..., all standard curtain-siders; the user renames them and changes their
// dimensions later.

/**
 * Standard curtain-sider (cerada). capacityKg is not confirmed: the process owner said
 * "I think 13 tonnes", but the sample sheet has single shipments heavier than that, so
 * the usual 24 t for a 13,6 m trailer is used until he answers.
 */
export const STANDARD_TRUCK = {
  capacityLdmTenths: 136,
  capacityKg: 24_000,
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
