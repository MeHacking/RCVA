import { buildCompletedResult, planarDistance } from './builders'
import { location, shipment, truck, type Scenario } from './scenario'

// Test 7 from "Specifikacija v2", section 10 (PDP, two phases per route, return to base).
// Planar coordinates in km, Euclidean distances. Expected: 2 trucks, 1001.5 km
// (S1+S3, S2+S4), even though 3 trucks would give 921.5 km.
// Locations have no lat/lon on purpose: the geometry is abstract.

const BASE = 700
const COORDINATES_KM = {
  700: [0, 0],
  711: [-50, 0], // S1 pickup
  712: [100, 0], // S1 delivery
  721: [-50, 10], // S2 pickup
  722: [100, 10], // S2 delivery
  731: [50, 0], // S3 pickup
  732: [-100, 0], // S3 delivery
  741: [50, 10], // S4 pickup
  742: [-100, 10], // S4 delivery
} as const

const locations = Object.entries(COORDINATES_KM).map(([id, [x, y]]) =>
  location(Number(id), Number(id) === BASE ? 'Baza (0, 0)' : `Tačka (${x}, ${y})`, 'XX', null, null),
)

const shipments = [
  shipment(71, 'S1', 60, 711, 712),
  shipment(72, 'S2', 60, 721, 722),
  shipment(73, 'S3', 40, 731, 732),
  shipment(74, 'S4', 40, 741, 742),
]

const DIMENSIONS_MM = [10000, 2480, 2700] as const
const trucks = [
  truck(71, 'Kamion A', 100, DIMENSIONS_MM),
  truck(72, 'Kamion B', 100, DIMENSIONS_MM),
  truck(73, 'Kamion C', 100, DIMENSIONS_MM),
  truck(74, 'Kamion D', 100, DIMENSIONS_MM),
]

export const test7Scenario: Scenario = {
  name: 'test7',
  description: 'Test 7 iz specifikacije: 2 kamiona, 1001,5 km',
  locations,
  shipments,
  trucks,
  base: { baseLocationId: BASE, returnToBase: true },
  outcome: {
    kind: 'COMPLETED',
    result: buildCompletedResult({
      shipments,
      trucks,
      baseLocationId: BASE,
      distance: planarDistance(COORDINATES_KM),
      routes: [
        {
          truckId: 71,
          stops: [
            ['PICKUP', 71],
            ['PICKUP', 73],
            ['DELIVERY', 71],
            ['DELIVERY', 73],
          ],
        },
        {
          truckId: 72,
          stops: [
            ['PICKUP', 72],
            ['PICKUP', 74],
            ['DELIVERY', 72],
            ['DELIVERY', 74],
          ],
        },
      ],
    }),
  },
}
