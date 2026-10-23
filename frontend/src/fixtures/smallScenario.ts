import { buildCompletedResult, haversineDistance } from './builders'
import { location, shipment, truck, type Scenario } from './scenario'

// Small realistic-looking data set (Balkan pickups -> Swedish deliveries, as in the Excel file).
// Coordinates are approximate city centres. Distances are great-circle ("air") distances,
// not road distances: the mock has no OSRM. The stop order is chosen by hand, not optimized.

const LAT_LON = {
  1: [44.8125, 20.4612], // Beograd (base and warehouse)
  2: [46.1003, 19.6658], // Subotica
  3: [44.0128, 20.9114], // Kragujevac
  4: [42.9981, 21.9461], // Leskovac
  5: [56.8333, 13.9333], // Ljungby
  6: [57.792, 12.317], // Stenkullen
  7: [55.8708, 12.8302], // Landskrona
} as const

const locations = [
  location(1, 'Beograd – magacin', 'RS', '11000', LAT_LON[1]),
  location(2, 'Subotica', 'RS', '24000', LAT_LON[2]),
  location(3, 'Kragujevac', 'RS', '34000', LAT_LON[3]),
  location(4, 'Leskovac', 'RS', '16000', LAT_LON[4]),
  location(5, 'Ljungby', 'SE', '34131', LAT_LON[5]),
  location(6, 'Stenkullen', 'SE', '44361', LAT_LON[6]),
  location(7, 'Landskrona', 'SE', '26100', LAT_LON[7]),
]

const shipments = [
  shipment(101, 'S-101', 40, 2, 5, { description: 'Paletirana roba', weightKg: 3200 }),
  shipment(102, 'S-102', 35, 1, 5, { description: 'Nameštaj', weightKg: 2100 }),
  shipment(103, 'S-103', 60, 3, 6, {
    description: 'Mašinski delovi',
    weightKg: 5400,
    lengthMm: 6000,
    widthMm: 2400,
    heightMm: 2200,
  }),
  shipment(104, 'S-104', 50, 1, 7, { description: 'Ambalaža', weightKg: 4100 }),
  shipment(105, 'S-105', 24, 4, 7, { description: 'Tekstil', weightKg: 1500 }),
]

const trucks = [
  truck(1, 'Šleper 1', 136, [13600, 2480, 2700]),
  truck(2, 'Šleper 2', 136, [13600, 2480, 2700]),
  truck(3, 'Solo 1', 70, [7000, 2480, 2600], false),
]

export const smallScenario: Scenario = {
  name: 'small',
  description: 'Mali skup: 5 pošiljki, 3 kamiona (jedan nedostupan)',
  locations,
  shipments,
  trucks,
  base: { baseLocationId: 1, returnToBase: true },
  outcome: {
    kind: 'COMPLETED',
    result: buildCompletedResult({
      shipments,
      trucks,
      baseLocationId: 1,
      distance: haversineDistance(LAT_LON),
      routes: [
        {
          truckId: 1,
          stops: [
            ['PICKUP', 105],
            ['PICKUP', 103],
            ['PICKUP', 104],
            ['DELIVERY', 104],
            ['DELIVERY', 105],
            ['DELIVERY', 103],
          ],
        },
        {
          truckId: 2,
          stops: [
            ['PICKUP', 102],
            ['PICKUP', 101],
            ['DELIVERY', 101],
            ['DELIVERY', 102],
          ],
        },
      ],
    }),
  },
}
