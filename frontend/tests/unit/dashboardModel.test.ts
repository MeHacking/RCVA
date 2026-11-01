import { describe, expect, it } from 'vitest'
import { buildDashboardModel } from '../../src/features/dashboard/dashboardModel'
import { SCENARIOS } from '../../src/fixtures'
import { shipment, truck } from '../../src/fixtures/scenario'

const model = (name: keyof typeof SCENARIOS, unlimitedFleet = false) => {
  const { shipments, locations, trucks } = SCENARIOS[name]
  return buildDashboardModel(shipments, locations, trucks, { unlimitedFleet })
}

const { locations } = SCENARIOS.small
const TO_SHIPMENTS = { to: '/shipments', label: 'Pošiljke' }
const TO_TRUCKS = { to: '/trucks', label: 'Kamioni' }

describe('buildDashboardModel', () => {
  it('summarizes the small data set without warnings', () => {
    expect(model('small')).toEqual({
      shipmentCount: 5,
      totalLdmTenths: 209,
      shipmentsWithErrors: 0,
      availableTrucks: 2,
      totalTrucks: 3,
      availableCapacityTenths: 272,
      unlimitedFleet: false,
      trucksLowerBound: 2,
      warnings: [],
    })
  })

  it('warns about a shipment larger than any truck (the PROVEN scenario), with the text of the job', () => {
    for (const unlimited of [false, true]) {
      expect(model('proven', unlimited).trucksLowerBound).toBeNull()
      expect(model('proven', unlimited).warnings).toEqual([
        { tone: 'danger', text: 'Pošiljka S-401 (14,0 LDM) je veća od najvećeg kamiona (13,6 LDM).', link: TO_SHIPMENTS },
      ])
    }
  })

  it('does not warn for NOT_FOUND: the total fits, infeasibility is not provable', () => {
    expect(model('notFound').warnings).toEqual([])
  })

  it('warns about shipments without coordinates (test 7 uses abstract coordinates)', () => {
    expect(model('test7').warnings.map((w) => w.text)).toEqual([
      'Pošiljke sa nejasnom lokacijom: 4. Bez koordinata ne mogu da uđu u rutu.',
    ])
  })

  it('warns when the total exceeds the available fleet, but not when trucks are added as needed', () => {
    const shipments = [shipment(1, 'A', 136, 1, 5), shipment(2, 'B', 136, 1, 5), shipment(3, 'C', 30, 1, 5)]
    const trucks = [truck(1, 'T1', 136, null), truck(2, 'T2', 136, null), truck(3, 'T3', 136, null, false)]
    const limited = buildDashboardModel(shipments, locations, trucks)
    expect(limited.trucksLowerBound).toBeNull()
    expect(limited.warnings).toEqual([
      { tone: 'danger', text: 'Ukupno 30,2 LDM je više od kapaciteta dostupnih kamiona (27,2 LDM).', link: TO_TRUCKS },
    ])

    const unlimited = buildDashboardModel(shipments, locations, trucks, { unlimitedFleet: true })
    expect(unlimited.warnings).toEqual([])
    expect(unlimited.trucksLowerBound).toBe(3)
    expect(unlimited.unlimitedFleet).toBe(true)
  })

  it('warns when no truck is available, but not when trucks are added as needed', () => {
    const { shipments, trucks } = SCENARIOS.small
    const none = trucks.map((t) => ({ ...t, available: false }))
    const result = buildDashboardModel(shipments, locations, none)
    expect(result.availableTrucks).toBe(0)
    expect(result.warnings).toEqual([{ tone: 'danger', text: 'Nijedan kamion nije dostupan.', link: TO_TRUCKS }])
    expect(buildDashboardModel(shipments, locations, none, { unlimitedFleet: true })).toMatchObject({ warnings: [], trucksLowerBound: 2 })
  })

  it('warns about weight: a shipment heavier than any payload, and a total over the payload of the fleet', () => {
    const heavy = [shipment(1, 'TESKA', 20, 1, 5, { weightKg: 30_000 })]
    // Trucks without a payload limit (the mock, the backend) never refuse weight.
    expect(buildDashboardModel(heavy, locations, SCENARIOS.small.trucks).warnings).toEqual([])
    // On the device every job has standard curtain-siders of 24 t.
    expect(buildDashboardModel(heavy, locations, [], { unlimitedFleet: true }).warnings).toEqual([
      { tone: 'danger', text: 'Pošiljka TESKA (30000 kg) je teža od najveće nosivosti kamiona (24000 kg).', link: TO_SHIPMENTS },
    ])

    const twoOfTen = [shipment(1, 'A', 20, 1, 5, { weightKg: 8000 }), shipment(2, 'B', 20, 1, 5, { weightKg: 8000 })]
    const small = [truck(1, 'Mali', 136, null, true, 10_000)]
    expect(buildDashboardModel(twoOfTen, locations, small).warnings.map((w) => w.text)).toEqual([
      'Ukupno 16000 kg je više od nosivosti dostupnih kamiona (10000 kg).',
    ])
  })

  it('counts the trucks needed by weight too', () => {
    // 3 x 2,0 LDM fit one truck by LDM, but 3 x 20 t (60 t) need three trucks of 24 t.
    const shipments = [1, 2, 3].map((id) => shipment(id, `T${id}`, 20, 1, 5, { weightKg: 20_000 }))
    expect(buildDashboardModel(shipments, locations, [], { unlimitedFleet: true }).trucksLowerBound).toBe(3)
  })
})
