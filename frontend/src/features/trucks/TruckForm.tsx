import { useId, useState, type FormEvent } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { Truck } from '../../api/types'
import {
  apiErrorsToForm,
  truckToFormValues,
  validateTruckForm,
  type TruckFormErrors,
  type TruckFormField,
  type TruckFormValues,
} from './truckFormValidation'

interface TruckFormProps {
  /** null = add a new truck */
  truck: Truck | null
  onSaved: (truck: Truck) => void
  onCancel: () => void
}

export function TruckForm({ truck, onSaved, onCancel }: TruckFormProps) {
  const api = useApi()
  const id = useId()
  const [values, setValues] = useState<TruckFormValues>(() => truckToFormValues(truck))
  const [errors, setErrors] = useState<TruckFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof TruckFormValues>(field: K, value: TruckFormValues[K]) =>
    setValues((previous) => ({ ...previous, [field]: value }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validateTruckForm(values)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }
    setErrors({})
    setFormError(null)
    setSaving(true)
    try {
      const saved = truck
        ? await api.updateTruck(truck.id, validation.input)
        : await api.createTruck(validation.input)
      onSaved(saved)
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.problem.errors) {
        setErrors(apiErrorsToForm(error.problem.errors))
      }
      setFormError(describeError(error))
      setSaving(false)
    }
  }

  const fieldProps = (field: TruckFormField) => ({
    id: `${id}-${field}`,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined,
  })
  const fieldError = (field: TruckFormField) =>
    errors[field] && (
      <span id={`${id}-${field}-error`} className="field__error">
        {errors[field]}
      </span>
    )

  return (
    <form className="panel truck-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{truck ? `Izmena kamiona #${truck.id}` : 'Novi kamion'}</h2>

      <div className="field">
        <label htmlFor={`${id}-name`}>Naziv</label>
        <input {...fieldProps('name')} value={values.name} onChange={(e) => set('name', e.target.value)} />
        {fieldError('name')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-capacityLdm`}>Kapacitet (LDM)</label>
        <input
          {...fieldProps('capacityLdm')}
          inputMode="decimal"
          placeholder="npr. 13,6"
          value={values.capacityLdm}
          onChange={(e) => set('capacityLdm', e.target.value)}
        />
        {fieldError('capacityLdm')}
      </div>

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
                onChange={(e) => set(field, e.target.value)}
              />
              {fieldError(field)}
            </div>
          ))}
        </div>
        {fieldError('dimensions')}
      </fieldset>

      <div className="field field--checkbox">
        <input
          id={`${id}-available`}
          type="checkbox"
          checked={values.available}
          onChange={(e) => set('available', e.target.checked)}
        />
        <label htmlFor={`${id}-available`}>Dostupan za optimizaciju</label>
      </div>

      {formError && (
        <p role="alert" className="text--error">
          Čuvanje nije uspelo: {formError}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={saving}>
          {saving ? 'Čuvanje…' : 'Sačuvaj'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Otkaži
        </button>
      </div>
    </form>
  )
}
