import { describe, expect, it } from 'vitest'
import { buildDashboardModel } from '../../src/features/dashboard/dashboardModel'
import { SCENARIOS } from '../../src/fixtures'
import { shipment, truck } from '../../src/fixtures/scenario'

const model = (name: keyof typeof SCENARIOS) => {
  const { shipments, locations, trucks } = SCENARIOS[name]
  return buildDashboardModel(shipments, locations, trucks)
}

describe('buildDashboardModel', () => {
  it('summarizes the small data set without warnings', () => {
    expect(model('small')).toEqual({
      shipmentCount: 5,
      totalLdmTenths: 209,
      shipmentsWithErrors: 0,
      availableTrucks: 2,
      totalTrucks: 3,
      availableCapacityTenths: 272,
      trucksLowerBound: 2,
      warnings: [],
    })
  })

  it('warns about a shipment larger than any truck (the PROVEN scenario)', () => {
    expect(model('proven').trucksLowerBound).toBeNull()
    expect(model('proven').warnings).toEqual([
      {
        tone: 'danger',
        text: 'Pošiljka S-401 (14,0 LDM) je veća od najvećeg dostupnog kamiona (13,6 LDM).',
        link: { to: '/shipments', label: 'Pošiljke' },
      },
    ])
  })

  it('does not warn for NOT_FOUND: the total fits, infeasibility is not provable', () => {
    expect(model('notFound').warnings).toEqual([])
  })

  it('warns about shipments without coordinates (test 7 uses abstract coordinates)', () => {
    expect(model('test7').warnings.map((w) => w.text)).toEqual([
      'Pošiljke sa nejasnom lokacijom: 4. Bez koordinata ne mogu da uđu u rutu.',
    ])
  })

  it('warns when the total exceeds the available fleet', () => {
    const { locations } = SCENARIOS.small
    const shipments = [shipment(1, 'A', 136, 1, 5), shipment(2, 'B', 136, 1, 5), shipment(3, 'C', 30, 1, 5)]
    const trucks = [truck(1, 'T1', 136, null), truck(2, 'T2', 136, null), truck(3, 'T3', 136, null, false)]
    const result = buildDashboardModel(shipments, locations, trucks)
    expect(result.trucksLowerBound).toBeNull()
    expect(result.warnings.map((w) => w.text)).toEqual([
      'Ukupno 30,2 LDM je više od kapaciteta dostupnih kamiona (27,2 LDM).',
    ])
  })

  it('warns when no truck is available', () => {
    const { shipments, locations, trucks } = SCENARIOS.small
    const result = buildDashboardModel(shipments, locations, trucks.map((t) => ({ ...t, available: false })))
    expect(result.availableTrucks).toBe(0)
    expect(result.warnings.map((w) => w.text)).toEqual([
      'Nijedan kamion nije označen kao dostupan, pa optimizacija ne može da se pokrene.',
    ])
  })
})
