import { describe, expect, it } from 'vitest'
import type { Shipment } from '../../src/api/types'
import { provenCauses, trucksLowerBound } from '../../src/domain/optimization/feasibility'
import type { JobTruck } from '../../src/domain/optimization/job'
import { standardFleet } from '../../src/domain/fleet'

function shipment(n: number, ldmTenths: number, weightKg: number | null): Shipment {
  return {
    id: n,
    externalId: `P-${n}`,
    description: null,
    ldmTenths,
    pickupLocationId: 1,
    deliveryLocationId: 2,
    splittable: false,
    weightKg,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
  }
}

function truck(id: number, capacityLdmTenths: number, capacityKg: number): JobTruck {
  return { id, name: `Kamion ${id}`, capacityLdmTenths, capacityKg }
}

describe('provenCauses', () => {
  it('finds nothing for ordinary shipments on a standard fleet', () => {
    const shipments = [shipment(1, 136, 24_000), shipment(2, 50, 8000), shipment(3, 20, null)]
    expect(provenCauses(shipments, standardFleet(shipments.length))).toEqual([])
  })

  it('rejects a job without trucks', () => {
    expect(provenCauses([shipment(1, 10, 100)], [])).toEqual(['Nijedan kamion nije dostupan.'])
  })

  it('names a shipment longer than the largest truck', () => {
    expect(provenCauses([shipment(1, 137, 100)], standardFleet(2))).toEqual([
      'Pošiljka P-1 (13,7 LDM) je veća od najvećeg kamiona (13,6 LDM).',
    ])
  })

  it('names a shipment heavier than the largest payload', () => {
    expect(provenCauses([shipment(1, 50, 24_001)], standardFleet(2))).toEqual([
      'Pošiljka P-1 (24001 kg) je teža od najveće nosivosti kamiona (24000 kg).',
    ])
  })

  it('names a shipment that needs the room of one truck and the payload of another', () => {
    const trucks = [truck(1, 136, 10_000), truck(2, 80, 24_000)]
    expect(provenCauses([shipment(1, 100, 12_000)], trucks)).toEqual([
      'Pošiljka P-1 (10,0 LDM, 12000 kg) ne staje ni u jedan kamion: nijedan nema i dovoljno mesta i dovoljnu nosivost.',
    ])
    // Either limit alone would allow it.
    expect(provenCauses([shipment(1, 100, 9000)], trucks)).toEqual([])
    expect(provenCauses([shipment(1, 70, 12_000)], trucks)).toEqual([])
  })

  it('compares the total weight with the whole fleet', () => {
    // LDM fits two trucks; the weight does not.
    const shipments = [shipment(1, 20, 18_000), shipment(2, 20, 18_000), shipment(3, 20, 18_000)]
    expect(provenCauses(shipments, standardFleet(2))).toEqual([
      'Ukupno 54000 kg je više od nosivosti dostupnih kamiona (48000 kg).',
    ])
  })

  it('compares the total LDM with the whole fleet', () => {
    const shipments = [shipment(1, 100, 1000), shipment(2, 100, 1000)]
    expect(provenCauses(shipments, standardFleet(1))).toEqual([
      'Ukupno 20,0 LDM je više od kapaciteta dostupnih kamiona (13,6 LDM).',
    ])
  })

  it('does not limit weight on trucks without a payload (the Java model)', () => {
    expect(provenCauses([shipment(1, 50, 1_000_000)], [truck(1, 136, Infinity)])).toEqual([])
  })
})

describe('trucksLowerBound', () => {
  it('lets weight decide when LDM alone would allow fewer trucks', () => {
    // 8,0 LDM fits one truck, 36 t needs two.
    const shipments = [1, 2, 3, 4].map((n) => shipment(n, 20, 9000))
    expect(trucksLowerBound(shipments, standardFleet(4))).toBe(2)
    expect(trucksLowerBound(shipments.map((s) => ({ ...s, weightKg: 1000 })), standardFleet(4))).toBe(1)
  })

  it('lets LDM decide when it needs more trucks than weight', () => {
    const shipments = [1, 2, 3].map((n) => shipment(n, 100, 1000))
    expect(trucksLowerBound(shipments, standardFleet(3))).toBe(3)
  })

  it('counts a shipment without weight as 0 kg', () => {
    expect(trucksLowerBound([shipment(1, 20, null), shipment(2, 20, 24_000)], standardFleet(2))).toBe(1)
  })

  it('is null when the fleet cannot carry the weight', () => {
    expect(trucksLowerBound([shipment(1, 20, 30_000)], standardFleet(1))).toBeNull()
    expect(trucksLowerBound([], [])).toBe(0)
  })
})
