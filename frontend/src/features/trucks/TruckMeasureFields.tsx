import { fieldPropsFor, type TruckFormErrors, type TruckFormField, type TruckFormValues } from './truckFormValidation'

type MeasureField = 'capacityLdm' | 'capacityKg' | 'innerLengthMm' | 'innerWidthMm' | 'innerHeightMm'

export function FieldError({ id, field, errors }: { id: string; field: TruckFormField; errors: TruckFormErrors }) {
  return errors[field] ? (
    <span id={`${id}-${field}-error`} className="field__error">
      {errors[field]}
    </span>
  ) : null
}

/** Capacity, payload and the cargo space: the same in the form of a truck and of a truck type. */
export function TruckMeasureFields({
  id,
  values,
  errors,
  withPayload,
  onChange,
}: {
  /** prefix of the input ids, as in the rest of the form */
  id: string
  values: TruckFormValues
  errors: TruckFormErrors
  /** the backend does not store a payload, so the field is not offered there */
  withPayload: boolean
  onChange: (field: MeasureField, value: string) => void
}) {
  const fieldProps = fieldPropsFor(id, errors)
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-capacityLdm`}>Kapacitet (LDM)</label>
        <input
          {...fieldProps('capacityLdm')}
          inputMode="decimal"
          placeholder="npr. 13,6"
          value={values.capacityLdm}
          onChange={(e) => onChange('capacityLdm', e.target.value)}
        />
        <FieldError id={id} field="capacityLdm" errors={errors} />
      </div>

      {withPayload && (
        <div className="field">
          <label htmlFor={`${id}-capacityKg`}>Nosivost (kg)</label>
          <input
            {...fieldProps('capacityKg')}
            inputMode="numeric"
            placeholder="prazno = bez ograničenja"
            value={values.capacityKg}
            onChange={(e) => onChange('capacityKg', e.target.value)}
          />
          <FieldError id={id} field="capacityKg" errors={errors} />
        </div>
      )}

      <fieldset className="field" aria-describedby={errors.dimensions ? `${id}-dimensions-error` : undefined}>
        <legend>Tovarni prostor u mm (opciono, za 3D prikaz)</legend>
        <div className="field-row">
          {(
            [
              ['innerLengthMm', 'Dužina'],
              ['innerWidthMm', 'Širina'],
              ['innerHeightMm', 'Visina'],
            ] as const
          ).map(([field, label]) => (
            <div className="field" key={field}>
              <label htmlFor={`${id}-${field}`}>{label}</label>
              <input
                {...fieldProps(field)}
                inputMode="numeric"
                value={values[field]}
                onChange={(e) => onChange(field, e.target.value)}
              />
              <FieldError id={id} field={field} errors={errors} />
            </div>
          ))}
        </div>
        <FieldError id={id} field="dimensions" errors={errors} />
      </fieldset>
    </>
  )
}
