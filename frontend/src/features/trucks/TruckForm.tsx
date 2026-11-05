import { useId, useState, type FormEvent } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { Truck, TruckType } from '../../api/types'
import { Icon } from '../../components/Icon'
import {
  apiErrorsToForm,
  fieldPropsFor,
  PAYLOAD_SUPPORTED,
  truckToFormValues,
  validateTruckForm,
  type TruckFormErrors,
  type TruckFormValues,
} from './truckFormValidation'
import { FieldError, TruckMeasureFields } from './TruckMeasureFields'
import { applyTemplate, truckTemplates } from './truckTemplates'

interface TruckFormProps {
  /** null = add a new truck */
  truck: Truck | null
  /** the trucks in the list: a new truck gets a name none of them has */
  trucks?: Truck[]
  /** the truck types the user added: a new truck can be filled from one of them */
  types?: TruckType[]
  onSaved: (truck: Truck) => void
  onCancel: () => void
}

export function TruckForm({ truck, trucks = [], types = [], onSaved, onCancel }: TruckFormProps) {
  const api = useApi()
  const id = useId()
  const [values, setValues] = useState<TruckFormValues>(() => truckToFormValues(truck))
  const [errors, setErrors] = useState<TruckFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [templateKey, setTemplateKey] = useState('')
  /** the name the last template offered, replaced by the next one until the user types their own */
  const [offeredName, setOfferedName] = useState<string | null>(null)
  const templates = truck ? [] : truckTemplates(types, { withPayload: PAYLOAD_SUPPORTED })

  function chooseTemplate(key: string) {
    setTemplateKey(key)
    const template = templates.find((t) => t.key === key)
    if (!template) return
    const filled = applyTemplate(
      values,
      template,
      trucks.map((t) => t.name),
      offeredName,
    )
    setValues(filled.values)
    setOfferedName(filled.offeredName)
    setErrors({})
  }

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

  const fieldProps = fieldPropsFor(id, errors)

  return (
    <form className="panel panel--dark truck-form edit-card" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
      <div className="truck-card__header">
        <h2 id={`${id}-title`}>{truck ? `Izmena kamiona #${truck.id}` : 'Novi kamion'}</h2>
        <button
          type="button"
          className="button--ghost edit-card__x"
          onClick={onCancel}
          disabled={saving}
          aria-label="Zatvori karticu"
          title="Zatvori"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {!truck && (
        <div className="field">
          <label htmlFor={`${id}-template`}>Popuni prema</label>
          <select
            id={`${id}-template`}
            value={templateKey}
            onChange={(e) => chooseTemplate(e.target.value)}
            aria-describedby={`${id}-template-hint`}
          >
            <option value="">Ručni unos</option>
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </select>
          <span id={`${id}-template-hint`} className="field__hint">
            Kapacitet, nosivost i dimenzije se prepisuju iz izabranog tipa kamiona; posle ih možete menjati.
          </span>
        </div>
      )}

      <div className="field">
        <label htmlFor={`${id}-name`}>Naziv</label>
        <input {...fieldProps('name')} value={values.name} onChange={(e) => set('name', e.target.value)} />
        <FieldError id={id} field="name" errors={errors} />
      </div>

      <TruckMeasureFields id={id} values={values} errors={errors} withPayload={PAYLOAD_SUPPORTED} onChange={set} />

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
        <button type="button" className="button--primary edit-card__close" onClick={onCancel} disabled={saving}>
          Zatvori
        </button>
      </div>
    </form>
  )
}
