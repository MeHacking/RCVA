import type { Truck, TruckType } from '../../api/types'
import { STANDARD_TYPE_NAME } from '../../api/truckValidation'
import { STANDARD_TRUCK } from '../../domain/fleet'
import { formatDimensionsMm, formatKg, formatLdm } from '../../format/units'
import { truckToFormValues, type TruckFormValues } from './truckFormValidation'

/**
 * A truck type the new-truck form can be filled from: the built-in standard curtain-sider or
 * a type the user added. Only the measures are copied; the name gets the first free number.
 * Trucks already in the list are not offered (04.11.2026: "Kamion 1", "Kamion 2"... are trucks,
 * not kinds of truck).
 */
export interface TruckTemplate {
  /** value of the select option */
  key: string
  label: string
  /** the name the new truck is offered ("Hladnjača" -> "Hladnjača 3" when 1 and 2 are taken) */
  baseName: string
  values: Omit<TruckFormValues, 'name' | 'available'>
}

export const STANDARD_TEMPLATE_KEY = 'standard'

type Measures = Pick<Truck, 'capacityLdmTenths' | 'capacityKg' | 'innerLengthMm' | 'innerWidthMm' | 'innerHeightMm'>

function measures(truck: Measures) {
  const all = truckToFormValues({ id: 0, name: '', available: true, ...truck })
  return {
    capacityLdm: all.capacityLdm,
    capacityKg: all.capacityKg,
    innerLengthMm: all.innerLengthMm,
    innerWidthMm: all.innerWidthMm,
    innerHeightMm: all.innerHeightMm,
  }
}

/** "13,6 LDM, 24000 kg, 13600 × 2480 × 2700 mm"; without the payload where it is not stored (server). */
export function describeMeasures(truck: Measures, withPayload: boolean): string {
  const parts = [`${formatLdm(truck.capacityLdmTenths)} LDM`]
  if (withPayload) parts.push(truck.capacityKg === null ? 'bez ograničenja težine' : `${formatKg(truck.capacityKg)} kg`)
  const dimensions = formatDimensionsMm(truck.innerLengthMm, truck.innerWidthMm, truck.innerHeightMm)
  if (dimensions) parts.push(dimensions)
  return parts.join(', ')
}

/** The built-in standard curtain-sider as a type, for the list of types. */
export const STANDARD_TYPE: Omit<TruckType, 'id'> = { name: STANDARD_TYPE_NAME, ...STANDARD_TRUCK }

/** The standard curtain-sider first, then the user's types in their order. */
export function truckTemplates(types: TruckType[], { withPayload = true }: { withPayload?: boolean } = {}): TruckTemplate[] {
  const label = (type: Omit<TruckType, 'id'>) => `${type.name} (${describeMeasures(type, withPayload)})`
  return [
    // Its trucks are "Kamion N", as the process owner asked for (B1).
    { key: STANDARD_TEMPLATE_KEY, label: label(STANDARD_TYPE), baseName: 'Kamion', values: measures(STANDARD_TYPE) },
    ...types.map((type) => ({ key: `type-${type.id}`, label: label(type), baseName: type.name.trim(), values: measures(type) })),
  ]
}

/**
 * "<base> N" with the smallest N from 1 that no truck has yet (names compared without case and
 * surrounding spaces), so a new truck never gets the name of one in the list.
 */
export function nextFreeName(baseName: string, takenNames: string[]): string {
  const taken = new Set(takenNames.map((name) => name.trim().toLocaleLowerCase('sr')))
  for (let n = 1; ; n++) {
    const name = `${baseName} ${n}`
    if (!taken.has(name.toLocaleLowerCase('sr'))) return name
  }
}

/**
 * Fills the form from a template. The name is replaced only while the user has not typed one
 * of their own (it is empty, or still the name offered by the previous template).
 */
export function applyTemplate(
  values: TruckFormValues,
  template: TruckTemplate,
  takenNames: string[],
  offeredName: string | null,
): { values: TruckFormValues; offeredName: string | null } {
  const ownName = values.name.trim() !== '' && values.name !== offeredName
  const name = ownName ? values.name : nextFreeName(template.baseName, takenNames)
  return { values: { ...values, ...template.values, name }, offeredName: ownName ? offeredName : name }
}
