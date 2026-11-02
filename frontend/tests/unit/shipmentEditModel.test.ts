import { describe, expect, it } from 'vitest'
import type { Location, Shipment, ShipmentUpdateResult } from '../../src/api/types'
import {
  apiErrorsToForm,
  buildShipmentPatch,
  describeUpdate,
  otherShipmentsAt,
  toFormValues,
} from '../../src/features/shipments/shipmentEditModel'

const LOCATIONS: Location[] = [
  { id: 1, name: 'Primerovo', address: null, country: 'RS', postalCode: null, lat: 45.1, lon: 20.1, geocodeStatus: 'OK' },
  { id: 2, name: 'Losestad', address: null, country: 'SE', postalCode: '11111', lat: null, lon: null, geocodeStatus: 'FAILED' },
]
const SHIPMENT: Shipment = {
  id: 7,
  externalId: 'N-7',
  description: null,
  ldmTenths: 24,
  pickupLocationId: 1,
  deliveryLocationId: 2,
  splittable: false,
  weightKg: 1200,
  lengthMm: null,
  widthMm: null,
  heightMm: null,
}
const initial = toFormValues(SHIPMENT, LOCATIONS)

describe('shipment form', () => {
  it('starts from the shipment and its places', () => {
    expect(initial).toEqual({
      externalId: 'N-7',
      ldm: '2,4',
      weight: '1200',
      description: '',
      pickup: { name: 'Primerovo', postalCode: '', country: 'RS', coordinates: '', moveOthers: true },
      delivery: { name: 'Losestad', postalCode: '11111', country: 'SE', coordinates: '', moveOthers: true },
    })
  })

  it('sends nothing for an unchanged form, which still looks the places up again', () => {
    expect(buildShipmentPatch(initial, initial)).toEqual({ ok: true, patch: {} })
  })

  it('sends only what changed, trimmed', () => {
    const values = { ...initial, externalId: ' N-8 ', ldm: '3.5', weight: '', description: ' Palete ' }
    expect(buildShipmentPatch(values, initial)).toEqual({
      ok: true,
      patch: { externalId: 'N-8', ldmTenths: 35, weightKg: null, description: 'Palete' },
    })
  })

  it('sends a replaced place with "move the others", and a corrected one with coordinates only', () => {
    const replaced = { ...initial, delivery: { ...initial.delivery, name: ' Novostad ' } }
    expect(buildShipmentPatch(replaced, initial)).toEqual({
      ok: true,
      patch: { delivery: { name: 'Novostad', postalCode: '11111', country: 'SE', moveOtherShipments: true } },
    })
    const alone = { ...initial, delivery: { ...initial.delivery, name: 'Novostad', moveOthers: false } }
    expect(buildShipmentPatch(alone, initial)).toEqual({
      ok: true,
      patch: { delivery: { name: 'Novostad', postalCode: '11111', country: 'SE' } },
    })
    // The same place with coordinates is corrected, not replaced: nothing to move.
    const located = { ...initial, delivery: { ...initial.delivery, coordinates: '59.1, 15.2' } }
    expect(buildShipmentPatch(located, initial)).toEqual({
      ok: true,
      patch: { delivery: { name: 'Losestad', postalCode: '11111', country: 'SE', coordinates: { lat: 59.1, lon: 15.2 } } },
    })
    const country = { ...initial, pickup: { ...initial.pickup, country: 'ba' } }
    expect(buildShipmentPatch(country, initial)).toEqual({
      ok: true,
      patch: { pickup: { name: 'Primerovo', postalCode: null, country: 'BA' } },
    })
  })

  it('says what is wrong with the form', () => {
    const values = {
      ...initial,
      externalId: '',
      ldm: '2,45',
      weight: '1,5',
      pickup: { ...initial.pickup, name: ' ' },
      delivery: { ...initial.delivery, coordinates: 'Novi Sad' },
    }
    expect(buildShipmentPatch(values, initial)).toEqual({
      ok: false,
      errors: {
        externalId: 'Unesite ID pošiljke.',
        ldm: 'Unesite LDM veći od 0, sa najviše jednom decimalom (npr. 2,4).',
        weight: 'Unesite težinu u celim kilogramima ili ostavite polje prazno.',
        pickup: 'Unesite mesto preuzimanja.',
        deliveryCoordinates: 'Unesite širinu i dužinu, npr. 45.2671, 19.8335.',
      },
    })
  })

  it('puts the API field errors on the form fields', () => {
    expect(apiErrorsToForm({ ldmTenths: 'a', weightKg: 'b', pickupCoordinates: 'c', other: 'd' })).toEqual({
      ldm: 'a',
      weight: 'b',
      pickupCoordinates: 'c',
    })
  })

  it('counts the other shipments at a place, as pickup or delivery', () => {
    const others = [SHIPMENT, { ...SHIPMENT, id: 8, pickupLocationId: 2 }, { ...SHIPMENT, id: 9 }, { ...SHIPMENT, id: 10, deliveryLocationId: 1 }]
    expect(otherShipmentsAt(2, others, SHIPMENT.id)).toBe(2)
  })
})

describe('message after saving', () => {
  const result = (places: ShipmentUpdateResult['places'], movedShipments = 0): ShipmentUpdateResult => ({
    shipment: SHIPMENT,
    movedShipments,
    places,
  })

  it('says what happened to each place and to the other shipments', () => {
    expect(
      describeUpdate(
        result(
          [
            { role: 'pickup', name: 'Primerovo', outcome: 'known', message: null },
            { role: 'delivery', name: 'Novostad', outcome: 'found', message: null },
          ],
          2,
        ),
      ),
    ).toEqual({
      tone: 'success',
      title: 'Pošiljka „N-7“ je sačuvana.',
      lines: ['„Novostad“: koordinate su pronađene.', 'Ispravljeno je i ostalih pošiljki sa istim mestom: 2.'],
    })
    expect(describeUpdate(result([{ role: 'delivery', name: 'Losestad', outcome: 'manual', message: null }])).lines).toEqual([
      '„Losestad“: koordinate su unete ručno.',
    ])
  })

  it('warns when a place is still unclear', () => {
    const notFound = describeUpdate(result([{ role: 'delivery', name: 'Losestad', outcome: 'notFound', message: null }]))
    expect(notFound.tone).toBe('warning')
    expect(notFound.lines).toEqual([
      '„Losestad“ nije pronađeno, pa lokacija ostaje nejasna. Upišite drugi naziv (npr. obližnje mesto) ili koordinate.',
    ])
    const failed = describeUpdate(result([{ role: 'delivery', name: 'Losestad', outcome: 'failed', message: 'Nema mreže.' }]))
    expect(failed.tone).toBe('warning')
    expect(failed.lines).toEqual(['Koordinate za „Losestad“ nisu tražene: Nema mreže. Sačuvajte ponovo kasnije.'])
  })
})
