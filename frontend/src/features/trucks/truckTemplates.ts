import type { Truck } from '../../api/types'
import { STANDARD_TRUCK } from '../../domain/fleet'
import { formatDimensionsMm, formatKg, formatLdm } from '../../format/units'
import { truckToFormValues, type TruckFormValues } from './truckFormValidation'

/**
 * A truck the new-truck form can be filled from: the standard curtain-sider or a truck that is
 * already in the list. Only the measures are copied; the name gets the first free number.
 */
export interface TruckTemplate {
  /** value of the select option */
  key: string
  label: string
  /** the name the new truck is offered ("Šleper 1" -> "Šleper 3" when 2 is taken) */
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
function describe(truck: Measures, withPayload: boolean): string {
  const parts = [`${formatLdm(truck.capacityLdmTenths)} LDM`]
  if (withPayload) parts.push(truck.capacityKg === null ? 'bez ograničenja težine' : `${formatKg(truck.capacityKg)} kg`)
  const dimensions = formatDimensionsMm(truck.innerLengthMm, truck.innerWidthMm, truck.innerHeightMm)
  if (dimensions) parts.push(dimensions)
  return parts.join(', ')
}

/** The standard curtain-sider first, then the trucks in the list in their order. */
export function truckTemplates(trucks: Truck[], { withPayload = true }: { withPayload?: boolean } = {}): TruckTemplate[] {
  const label = (truck: Measures) => describe(truck, withPayload)
  const standard = { ...STANDARD_TRUCK }
  return [
    {
      key: STANDARD_TEMPLATE_KEY,
      label: `Standardna cerada (${label(standard)})`,
      baseName: 'Kamion',
      values: measures(standard),
    },
    ...trucks.map((truck) => ({
      key: String(truck.id),
      label: `${truck.name} (${label(truck)})`,
      baseName: truck.name.trim().replace(/\s*\d+$/, '') || truck.name.trim(),
      values: measures(truck),
    })),
  ]
}

/**
 * "<base> N" with the smallest N from 1 that no truck has yet (names compared without case and
 * surrounding spaces), so a copy never gets the name of the truck it was copied from.
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
