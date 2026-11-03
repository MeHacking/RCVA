import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useApi } from '../../api/apiContext'
import { apiMode } from '../../api/apiMode'
import { ApiError, describeError } from '../../api/client'
import type { Location, Shipment, ShipmentUpdateResult } from '../../api/types'
import { OsmAttribution } from '../../components/OsmAttribution'
import { formatCoordinates } from '../../format/coordinates'
import {
  apiErrorsToForm,
  buildShipmentPatch,
  otherShipmentsAt,
  placeReplaced,
  toFormValues,
  type PlaceFormValues,
  type PlaceRole,
  type ShipmentFormErrors,
  type ShipmentFormField,
  type ShipmentFormValues,
} from './shipmentEditModel'

/** Correction of an imported shipment, in a row below it; only changed fields are sent. */
export function ShipmentEditor({
  shipment,
  shipments,
  locations,
  onSaved,
  onCancel,
}: {
  shipment: Shipment
  shipments: Shipment[]
  locations: Location[]
  onSaved: (result: ShipmentUpdateResult) => void
  onCancel: () => void
}) {
  const api = useApi()
  const id = useId()
  const [initial] = useState(() => toFormValues(shipment, locations))
  const [values, setValues] = useState<ShipmentFormValues>(initial)
  const [errors, setErrors] = useState<ShipmentFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof ShipmentFormValues>(field: K, value: ShipmentFormValues[K]) =>
    setValues((previous) => ({ ...previous, [field]: value }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const built = buildShipmentPatch(values, initial)
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    setErrors({})
    setFormError(null)
    setSaving(true)
    try {
      onSaved(await api.updateShipment(shipment.id, built.patch))
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.problem.errors) {
        setErrors(apiErrorsToForm(error.problem.errors))
      }
      setFormError(describeError(error))
      setSaving(false)
    }
  }

  const fieldProps = (field: ShipmentFormField) => ({
    id: `${id}-${field}`,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined,
  })
  const fieldError = (field: ShipmentFormField) =>
    errors[field] && (
      <span id={`${id}-${field}-error`} className="field__error">
        {errors[field]}
      </span>
    )

  const place = (role: PlaceRole) => {
    const locationId = role === 'pickup' ? shipment.pickupLocationId : shipment.deliveryLocationId
    return (
      <PlaceEditor
        role={role}
        idPrefix={id}
        location={locations.find((l) => l.id === locationId)}
        others={otherShipmentsAt(locationId, shipments, shipment.id)}
        value={values[role]}
        initial={initial[role]}
        onChange={(value) => set(role, value)}
        fieldProps={fieldProps}
        fieldError={fieldError}
      />
    )
  }

  return (
    <form className="row-editor" onSubmit={handleSubmit} noValidate aria-label={`Izmena pošiljke ${shipment.externalId}`}>
      <div className="row-editor__grid">
        {place('pickup')}
        {place('delivery')}
        <fieldset className="field">
          <legend>Pošiljka</legend>
          <div className="field">
            <label htmlFor={`${id}-externalId`}>ID</label>
            <input {...fieldProps('externalId')} value={values.externalId} onChange={(e) => set('externalId', e.target.value)} />
            {fieldError('externalId')}
          </div>
          <div className="field-row field-row--2">
            <div className="field">
              <label htmlFor={`${id}-ldm`}>LDM</label>
              <input {...fieldProps('ldm')} inputMode="decimal" value={values.ldm} onChange={(e) => set('ldm', e.target.value)} />
              {fieldError('ldm')}
            </div>
            <div className="field">
              <label htmlFor={`${id}-weight`}>Težina (kg)</label>
              <input
                {...fieldProps('weight')}
                inputMode="numeric"
                value={values.weight}
                onChange={(e) => set('weight', e.target.value)}
              />
              {fieldError('weight')}
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${id}-description`}>Opis</label>
            <input id={`${id}-description`} value={values.description} onChange={(e) => set('description', e.target.value)} />
          </div>
        </fieldset>
      </div>
      <p className="text--muted row-editor__note">
        Pri čuvanju se koordinate traže samo za mesta ove pošiljke koja ih nemaju. Upisan naziv se traži ponovo i ako
        ranije nije pronađen; za mesto koje ovde nije menjano koristi se zapamćen odgovor.
        {apiMode() === 'local' && (
          <>
            {' '}
            <OsmAttribution />
          </>
        )}
      </p>
      {formError && (
        <p role="alert" className="text--error">
          Izmena nije sačuvana: {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={saving}>
          {saving ? 'Čuvanje…' : 'Sačuvaj izmenu'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Otkaži
        </button>
      </div>
    </form>
  )
}

const LEGENDS: Record<PlaceRole, string> = { pickup: 'Preuzimanje', delivery: 'Isporuka' }

function PlaceEditor({
  role,
  idPrefix,
  location,
  others,
  value,
  initial,
  onChange,
  fieldProps,
  fieldError,
}: {
  role: PlaceRole
  idPrefix: string
  /** the place the shipment has now */
  location: Location | undefined
  /** other shipments at that place */
  others: number
  value: PlaceFormValues
  initial: PlaceFormValues
  onChange: (value: PlaceFormValues) => void
  fieldProps: (field: ShipmentFormField) => FieldProps
  fieldError: (field: ShipmentFormField) => ReactNode
}) {
  const set = <K extends keyof PlaceFormValues>(field: K, text: PlaceFormValues[K]) => onChange({ ...value, [field]: text })
  const prefix = `${idPrefix}-${role}`
  const coordinatesField = `${role}Coordinates` as const
  const located = location && location.lat !== null && location.lon !== null ? { lat: location.lat, lon: location.lon } : null
  const replaced = placeReplaced(value, initial)
  return (
    <fieldset className="field">
      <legend>{LEGENDS[role]}</legend>
      <p className="row-editor__place-status">
        {located ? (
          <>
            Koordinate: {formatCoordinates(located)}
            {location?.geocodeStatus === 'MANUAL' && ' (ručno uneta lokacija)'}
          </>
        ) : (
          <span className="text--error">Nema koordinata (nejasna lokacija).</span>
        )}
      </p>
      <div className="field">
        <label htmlFor={`${idPrefix}-${role}`}>Mesto</label>
        <input {...fieldProps(role)} value={value.name} onChange={(e) => set('name', e.target.value)} />
        {fieldError(role)}
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-country`}>Zemlja</label>
        <input id={`${prefix}-country`} value={value.country} onChange={(e) => set('country', e.target.value)} />
      </div>
      {/* A place with coordinates keeps them; coordinates by hand are only for a place without them. */}
      {(!located || replaced) && (
        <div className="field">
          <label htmlFor={`${idPrefix}-${coordinatesField}`}>Koordinate (ručno, neobavezno)</label>
          <input
            {...fieldProps(coordinatesField)}
            inputMode="decimal"
            placeholder="npr. 45.2671, 19.8335"
            value={value.coordinates}
            onChange={(e) => set('coordinates', e.target.value)}
          />
          {fieldError(coordinatesField) ?? (
            <span className="field__hint">Širina, dužina (kao u Google mapama); samo ako se mesto ne pronađe.</span>
          )}
        </div>
      )}
      {!located && replaced && others > 0 && (
        <div className="field field--checkbox">
          <input
            id={`${prefix}-move`}
            type="checkbox"
            checked={value.moveOthers}
            onChange={(e) => set('moveOthers', e.target.checked)}
          />
          <label htmlFor={`${prefix}-move`}>
            Ispravi i u ostalim pošiljkama sa mestom „{initial.name}“ ({others})
          </label>
        </div>
      )}
    </fieldset>
  )
}

interface FieldProps {
  id: string
  'aria-invalid': boolean | undefined
  'aria-describedby': string | undefined
}
