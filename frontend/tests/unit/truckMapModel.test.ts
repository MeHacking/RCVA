import { describe, expect, it } from 'vitest'
import type { Location, Truck, TruckStart } from '../../src/api/types'
import { pinLabel, truckMapModel } from '../../src/features/trucks/truckMapModel'

function place(id: number, name: string, lat: number | null = 45 + id, lon: number | null = 19 + id): Location {
  return { id, name, address: null, country: null, postalCode: null, lat, lon, geocodeStatus: lat === null ? 'FAILED' : 'MANUAL' }
}

function truck(id: number, name: string, available = true): Truck {
  return { id, name, capacityLdmTenths: 136, capacityKg: 24_000, available, innerLengthMm: null, innerWidthMm: null, innerHeightMm: null }
}

const at = (truckId: number, location: Location | null, proposal: Location | null = null): TruckStart => ({
  truckId,
  location,
  proposal: proposal ? { location: proposal, jobId: 3, finishedAt: null } : null,
})

describe('truckMapModel', () => {
  it('puts trucks at the same place on one pin, in the order of the trucks', () => {
    const subotica = place(1, 'Subotica')
    const model = truckMapModel(
      [truck(1, 'Kamion 1'), truck(2, 'Kamion 2'), truck(3, 'Kamion 3')],
      [at(1, subotica), at(2, place(2, 'Novi Sad')), at(3, subotica)],
    )
    expect(model.pins).toEqual([
      { kind: 'location', locationId: 1, placeName: 'Subotica', at: [46, 20], trucks: [{ id: 1, name: 'Kamion 1', available: true }, { id: 3, name: 'Kamion 3', available: true }] },
      { kind: 'location', locationId: 2, placeName: 'Novi Sad', at: [47, 21], trucks: [{ id: 2, name: 'Kamion 2', available: true }] },
    ])
    expect(model.nowhere).toEqual([])
  })

  it('lists the trucks without a location, or at a place without coordinates', () => {
    const model = truckMapModel([truck(1, 'A'), truck(2, 'B'), truck(3, 'C')], [at(1, null), at(3, place(5, 'Negde', null, null))])
    expect(model.pins).toEqual([])
    expect(model.nowhere).toEqual(['A', 'B', 'C'])
  })

  it('shows a proposal as a pin of its own, after the locations, also at the same place', () => {
    const beograd = place(1, 'Beograd')
    const oslo = place(9, 'Oslo')
    const model = truckMapModel(
      [truck(1, 'K1'), truck(2, 'K2'), truck(3, 'K3')],
      [at(1, beograd, oslo), at(2, null, oslo), at(3, beograd, beograd)],
    )
    expect(model.pins.map((p) => [p.kind, p.placeName, p.trucks.map((t) => t.name)])).toEqual([
      ['location', 'Beograd', ['K1', 'K3']],
      ['proposal', 'Oslo', ['K1', 'K2']],
      ['proposal', 'Beograd', ['K3']],
    ])
    // A proposal is not where the truck is.
    expect(model.nowhere).toEqual(['K2'])
  })

  it('says the place and its trucks, and which are not available', () => {
    const model = truckMapModel([truck(1, 'K1'), truck(2, 'K2', false)], [at(1, place(1, 'Niš'), place(2, 'Malmö')), at(2, place(1, 'Niš'))])
    expect(model.pins.map(pinLabel)).toEqual(['Niš: K1, K2 (nije dostupan)', 'Malmö, predlog posle optimizacije: K1'])
  })
})
