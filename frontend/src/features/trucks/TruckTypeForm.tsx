import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { TruckType } from '../../api/types'
import {
  apiErrorsToForm,
  fieldPropsFor,
  PAYLOAD_SUPPORTED,
  truckTypeToFormValues,
  validateTruckTypeForm,
  type TruckFormErrors,
  type TruckFormValues,
} from './truckFormValidation'
import { FieldError, TruckMeasureFields } from './TruckMeasureFields'

interface TruckTypeFormProps {
  /** null = add a new type */
  type: TruckType | null
  onSaved: (type: TruckType) => void
  /** closes the types card, the form with it */
  onClose: () => void
}

export function TruckTypeForm({ type, onSaved, onClose }: TruckTypeFormProps) {
  const api = useApi()
  const id = useId()
  const [values, setValues] = useState<TruckFormValues>(() => truckTypeToFormValues(type))
  const [errors, setErrors] = useState<TruckFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // The form opens below the trucks (or the types), maybe out of sight: the name gets the focus.
  useEffect(() => nameRef.current?.focus(), [])

  const set = <K extends keyof TruckFormValues>(field: K, value: TruckFormValues[K]) =>
    setValues((previous) => ({ ...previous, [field]: value }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validateTruckTypeForm(values)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }
    setErrors({})
    setFormError(null)
    setSaving(true)
    try {
      const saved = type
        ? await api.updateTruckType(type.id, validation.input)
        : await api.createTruckType(validation.input)
      onSaved(saved)
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.problem.errors) {
        setErrors(apiErrorsToForm(error.problem.errors))
      }
      setFormError(describeError(error))
      setSaving(false)
    }
  }

  const fieldProps = fieldPropsFor(id, errors)

  return (
    <form className="truck-form truck-type-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{type ? `Izmena tipa „${type.name}“` : 'Novi tip kamiona'}</h3>
      {type && (
        <p className="text--muted">
          Izmena tipa ne menja kamione koji su već dodati; važi za kamione koje dodate posle.
        </p>
      )}

      <div className="field">
        <label htmlFor={`${id}-name`}>Naziv tipa</label>
        <input
          {...fieldProps('name')}
          ref={nameRef}
          placeholder="npr. Hladnjača"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <FieldError id={id} field="name" errors={errors} />
      </div>

      <TruckMeasureFields id={id} values={values} errors={errors} withPayload={PAYLOAD_SUPPORTED} required onChange={set} />

      {formError && (
        <p role="alert" className="text--error">
          Čuvanje nije uspelo: {formError}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={saving}>
          {saving ? 'Čuvanje…' : 'Sačuvaj tip'}
        </button>
        <button type="button" className="button--primary edit-card__close" onClick={onClose} disabled={saving}>
          Zatvori
        </button>
      </div>
    </form>
  )
}
