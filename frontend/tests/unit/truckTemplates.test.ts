import { describe, expect, it } from 'vitest'
import type { Truck, TruckType } from '../../src/api/types'
import { truckToFormValues } from '../../src/features/trucks/truckFormValidation'
import {
  STANDARD_TEMPLATE_KEY,
  applyTemplate,
  nextFreeName,
  truckTemplates,
  typeDraftFromTruck,
} from '../../src/features/trucks/truckTemplates'

const type = (over: Partial<TruckType>): TruckType => ({
  id: 1,
  name: 'Šleper',
  capacityLdmTenths: 136,
  capacityKg: 24000,
  innerLengthMm: 13600,
  innerWidthMm: 2480,
  innerHeightMm: 2700,
  ...over,
})

const SOLO = type({ id: 7, name: 'Solo', capacityLdmTenths: 70, capacityKg: null, innerLengthMm: null, innerWidthMm: null, innerHeightMm: null })

describe('truckTemplates', () => {
  it('offers the standard curtain-sider first, then every type in its order', () => {
    const templates = truckTemplates([type({}), SOLO])
    expect(templates.map((t) => t.key)).toEqual([STANDARD_TEMPLATE_KEY, 'type-1', 'type-7'])
    expect(templates[0]).toMatchObject({
      label: 'Standardna cerada (13,6 LDM, 24000 kg, 13600 × 2480 × 2700 mm)',
      baseName: 'Kamion',
      values: { capacityLdm: '13,6', capacityKg: '24000', innerLengthMm: '13600', innerWidthMm: '2480', innerHeightMm: '2700' },
    })
    expect(templates[2]).toMatchObject({
      label: 'Solo (7,0 LDM, bez ograničenja težine)',
      baseName: 'Solo',
      values: { capacityLdm: '7,0', capacityKg: '', innerLengthMm: '', innerWidthMm: '', innerHeightMm: '' },
    })
  })

  it('offers only the standard curtain-sider when there are no types', () => {
    expect(truckTemplates([]).map((t) => t.label)).toEqual(['Standardna cerada (13,6 LDM, 24000 kg, 13600 × 2480 × 2700 mm)'])
  })

  it('leaves the payload out of the label where it is not stored', () => {
    expect(truckTemplates([SOLO], { withPayload: false }).map((t) => t.label)).toEqual([
      'Standardna cerada (13,6 LDM, 13600 × 2480 × 2700 mm)',
      'Solo (7,0 LDM)',
    ])
  })

  it('offers the name of the type, a number included', () => {
    expect(truckTemplates([type({ name: ' Cerada 12 ' })]).map((t) => t.baseName)).toEqual(['Kamion', 'Cerada 12'])
  })
})

describe('typeDraftFromTruck', () => {
  const truck: Truck = { ...type({}), id: 4, name: ' Šleper 12 ', available: false, startLocationId: 3, startSetAfterJobId: 2 }

  it('takes the measures of the truck and its name without the number at the end', () => {
    expect(typeDraftFromTruck(truck)).toEqual({
      name: 'Šleper',
      capacityLdmTenths: 136,
      capacityKg: 24000,
      innerLengthMm: 13600,
      innerWidthMm: 2480,
      innerHeightMm: 2700,
    })
    expect(typeDraftFromTruck({ ...SOLO, name: 'Solo', available: true }).name).toBe('Solo')
    expect(typeDraftFromTruck({ ...SOLO, name: '12', available: true }).name).toBe('12')
  })
})

describe('nextFreeName', () => {
  it('takes the smallest free number, ignoring case and spaces', () => {
    expect(nextFreeName('Šleper', ['šleper 1', ' Šleper 2 ', 'Šleper 4'])).toBe('Šleper 3')
    expect(nextFreeName('Kamion', [])).toBe('Kamion 1')
    expect(nextFreeName('Solo', ['Solo'])).toBe('Solo 1')
  })
})

describe('applyTemplate', () => {
  const [standard, sleper, solo] = truckTemplates([type({}), SOLO])
  const taken = ['Šleper 1', 'Šleper 2', 'Solo']

  it('copies the measures, keeps availability and offers a free name', () => {
    const empty = truckToFormValues(null)
    const filled = applyTemplate({ ...empty, available: false }, sleper, taken, null)
    expect(filled.values).toEqual({
      name: 'Šleper 3',
      capacityLdm: '13,6',
      capacityKg: '24000',
      innerLengthMm: '13600',
      innerWidthMm: '2480',
      innerHeightMm: '2700',
      available: false,
    })
    expect(filled.offeredName).toBe('Šleper 3')
  })

  it('names a standard curtain-sider "Kamion N"', () => {
    expect(applyTemplate(truckToFormValues(null), standard, ['Kamion 1', 'Šleper 1'], null).values.name).toBe('Kamion 2')
  })

  it('replaces an offered name, but never a name the user typed', () => {
    const first = applyTemplate(truckToFormValues(null), sleper, taken, null)
    const second = applyTemplate(first.values, solo, taken, first.offeredName)
    expect(second.values).toMatchObject({ name: 'Solo 1', capacityLdm: '7,0', capacityKg: '', innerLengthMm: '' })

    const typed = applyTemplate({ ...second.values, name: 'Moj kamion' }, sleper, taken, second.offeredName)
    expect(typed.values).toMatchObject({ name: 'Moj kamion', capacityLdm: '13,6' })
    expect(typed.offeredName).toBe('Solo 1')
  })
})
