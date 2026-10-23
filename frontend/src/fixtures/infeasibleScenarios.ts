import { location, shipment, truck, type Scenario } from './scenario'

const locations = [
  location(1, 'Beograd – magacin', 'RS', '11000', [44.8125, 20.4612]),
  location(5, 'Ljungby', 'SE', '34131', [56.8333, 13.9333]),
]
const base = { baseLocationId: 1, returnToBase: true }
const trucks = [truck(1, 'Šleper 1', 136, [13600, 2480, 2700]), truck(2, 'Šleper 2', 136, [13600, 2480, 2700])]

/** Test 4 from the specification: one shipment larger than the largest truck -> 422 PROVEN. */
export const provenScenario: Scenario = {
  name: 'proven',
  description: 'Dokazano neizvodljivo: pošiljka 14,0 LDM, najveći kamion 13,6 LDM',
  locations,
  shipments: [shipment(401, 'S-401', 140, 1, 5)],
  trucks,
  base,
  outcome: {
    kind: 'PROVEN',
    causes: ['Pošiljka S-401 (14,0 LDM) je veća od najvećeg kamiona (13,6 LDM).'],
  },
}

/**
 * Test 5b from the specification: 3 x 7,0 LDM on 2 x 13,6 LDM. The total fits, so the
 * pre-check proves nothing, but no packing exists -> the solver ends with NOT_FOUND.
 */
export const notFoundScenario: Scenario = {
  name: 'notFound',
  description: 'Rešenje nije nađeno: 3 × 7,0 LDM na 2 × 13,6 LDM',
  locations,
  shipments: [shipment(501, 'S-501', 70, 1, 5), shipment(502, 'S-502', 70, 1, 5), shipment(503, 'S-503', 70, 1, 5)],
  trucks,
  base,
  outcome: { kind: 'NOT_FOUND', trucksLowerBound: 2 },
}
