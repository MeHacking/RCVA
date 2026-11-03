import { describe, expect, it } from 'vitest'
import { buildDashboardModel, loadLevel, truckLoads } from '../../src/features/dashboard/dashboardModel'
import { SCENARIOS } from '../../src/fixtures'
import { shipment, truck } from '../../src/fixtures/scenario'
import type { TruckStart } from '../../src/api/types'

const model = (name: keyof typeof SCENARIOS) => {
  const { shipments, locations, trucks } = SCENARIOS[name]
  return buildDashboardModel(shipments, locations, trucks)
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
      trucksLowerBound: 2,
      warnings: [],
      totalWeightKg: 16_300,
      // Šleper 1 and 2 have no payload: weight is not limited.
      availableCapacityKg: null,
      statusCounts: { OK: 5, MANUAL: 0, LOCATION_ERROR: 0 },
    })
  })

  it('warns about a shipment larger than any truck (the PROVEN scenario), with the text of the job', () => {
    expect(model('proven').trucksLowerBound).toBeNull()
    expect(model('proven').warnings).toEqual([
      { tone: 'danger', text: 'Pošiljka S-401 (14,0 LDM) je veća od najvećeg kamiona (13,6 LDM).', link: TO_SHIPMENTS },
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

  it('warns when the total exceeds the available fleet (also on the device: trucks are not added by themselves)', () => {
    const shipments = [shipment(1, 'A', 136, 1, 5), shipment(2, 'B', 136, 1, 5), shipment(3, 'C', 30, 1, 5)]
    const trucks = [truck(1, 'T1', 136, null), truck(2, 'T2', 136, null), truck(3, 'T3', 136, null, false)]
    const limited = buildDashboardModel(shipments, locations, trucks)
    expect(limited.trucksLowerBound).toBeNull()
    expect(limited.warnings).toEqual([
      { tone: 'danger', text: 'Ukupno 30,2 LDM je više od kapaciteta dostupnih kamiona (27,2 LDM).', link: TO_TRUCKS },
    ])

    const enough = buildDashboardModel(shipments, locations, trucks.map((t) => ({ ...t, available: true })))
    expect(enough.warnings).toEqual([])
    expect(enough.trucksLowerBound).toBe(3)
  })

  it('warns when no truck is available', () => {
    const { shipments, trucks } = SCENARIOS.small
    const none = trucks.map((t) => ({ ...t, available: false }))
    const result = buildDashboardModel(shipments, locations, none)
    expect(result.availableTrucks).toBe(0)
    expect(result.warnings).toEqual([{ tone: 'danger', text: 'Nijedan kamion nije dostupan.', link: TO_TRUCKS }])
  })

  it('warns about weight: a shipment heavier than any payload, and a total over the payload of the fleet', () => {
    const heavy = [shipment(1, 'TESKA', 20, 1, 5, { weightKg: 30_000 })]
    // Trucks without a payload limit (the mock, the backend) never refuse weight.
    expect(buildDashboardModel(heavy, locations, SCENARIOS.small.trucks).warnings).toEqual([])
    const curtainSider = [truck(1, 'Kamion 1', 136, null, true, 24_000)]
    expect(buildDashboardModel(heavy, locations, curtainSider).warnings).toEqual([
      { tone: 'danger', text: 'Pošiljka TESKA (30000 kg) je teža od najveće nosivosti kamiona (24000 kg).', link: TO_SHIPMENTS },
      { tone: 'danger', text: 'Ukupno 30000 kg je više od nosivosti dostupnih kamiona (24000 kg).', link: TO_TRUCKS },
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
    const curtainSiders = [1, 2, 3, 4].map((id) => truck(id, `Kamion ${id}`, 136, null, true, 24_000))
    expect(buildDashboardModel(shipments, locations, curtainSiders).trucksLowerBound).toBe(3)
  })

  it('warns on the device about available trucks without a location, and about proposals waiting', () => {
    const { shipments, trucks } = SCENARIOS.small
    const beograd = locations[0]
    const starts: TruckStart[] = [
      { truckId: 1, location: null, proposal: null },
      { truckId: 2, location: beograd, proposal: { location: locations[1], jobId: 4, finishedAt: null } },
      // Solo 1 is unavailable: not asked for.
      { truckId: 3, location: null, proposal: null },
    ]
    expect(buildDashboardModel(shipments, locations, trucks, starts).warnings).toEqual([
      { tone: 'warning', text: 'Kamioni bez lokacije: 1. Pre optimizacije unesite gde se nalaze.', link: TO_TRUCKS },
      { tone: 'warning', text: 'Predlozi novih lokacija kamiona čekaju potvrdu: 1.', link: TO_TRUCKS },
    ])
    const settled = starts.map((s) => ({ ...s, location: beograd, proposal: null }))
    expect(buildDashboardModel(shipments, locations, trucks, settled).warnings).toEqual([])
  })
})

describe('dashboard charts', () => {
  it('says how full a load is: normal up to 85 %, high up to 100 %, then over', () => {
    expect([loadLevel(85, 100), loadLevel(86, 100), loadLevel(100, 100), loadLevel(101, 100)]).toEqual(['normal', 'high', 'high', 'over'])
  })

  it('adds up the payload of the available trucks, and counts statuses', () => {
    const trucks = [truck(1, 'A', 136, null, true, 24_000), truck(2, 'B', 136, null, true, 10_000), truck(3, 'C', 136, null, false, 5_000)]
    const unclear = { ...locations[1], id: 9, lat: null, lon: null, geocodeStatus: 'FAILED' as const }
    const shipments = [shipment(1, 'A', 10, 1, 5, { weightKg: 1200 }), shipment(2, 'B', 10, 9, 5)]
    const result = buildDashboardModel(shipments, [...locations, unclear], trucks)
    expect(result).toMatchObject({ totalWeightKg: 1200, availableCapacityKg: 34_000, statusCounts: { OK: 1, MANUAL: 0, LOCATION_ERROR: 1 } })
  })

  it('gives each truck of a result its load, weight, kilometres and route color', () => {
    const { shipments, trucks, outcome } = SCENARIOS.small
    if (outcome.kind !== 'COMPLETED') throw new Error('small is COMPLETED')
    const loads = truckLoads(outcome.result, trucks, shipments)
    expect(loads.map((l) => [l.name, l.color, l.capacityLdmTenths])).toEqual(
      outcome.result.routes.map((r, i) => [trucks.find((t) => t.id === r.truckId)!.name, i + 1, 136]),
    )
    for (const [i, route] of outcome.result.routes.entries()) {
      const picked = route.stops.filter((s) => s.type === 'PICKUP').map((s) => s.shipmentId)
      const weight = shipments.filter((s) => picked.includes(s.id)).reduce((sum, s) => sum + (s.weightKg ?? 0), 0)
      expect(loads[i]).toMatchObject({ usedLdmTenths: route.usedLdmTenths, weightKg: weight, meters: route.totalMeters })
    }
    // A truck removed since keeps its route, without a capacity.
    expect(truckLoads(outcome.result, [], shipments)[0]).toMatchObject({ name: `Kamion #${outcome.result.routes[0].truckId}`, capacityLdmTenths: null })
  })
})
