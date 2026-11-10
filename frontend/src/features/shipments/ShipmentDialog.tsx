import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { useApi } from '../../api/apiContext'
import { apiMode } from '../../api/apiMode'
import { ApiError, describeError } from '../../api/client'
import type { Location, Shipment, ShipmentUpdateResult } from '../../api/types'
import { CountrySelect } from '../../components/CountrySelect'
import { Icon } from '../../components/Icon'
import { OsmAttribution } from '../../components/OsmAttribution'
import { haversineMeters } from '../../domain/optimization/distance'
import { formatCoordinates } from '../../format/coordinates'
import { formatKm } from '../../format/units'
import {
  apiErrorsToForm,
  buildShipmentInput,
  buildShipmentPatch,
  emptyFormValues,
  otherShipmentsAt,
  placeReplaced,
  toFormValues,
  type PlaceFormValues,
  type PlaceRole,
  type ShipmentFormErrors,
  type ShipmentFormField,
  type ShipmentFormValues,
} from './shipmentEditModel'

/**
 * A shipment entered by hand (`shipment` null) or the correction of one, in a modal window
 * (a native <dialog>: Escape closes it, focus stays inside and goes back to the button
 * after). A correction sends only the changed fields. A click beside the window does not
 * close it, so what was typed is not lost by accident.
 */
export function ShipmentDialog({
  shipment,
  shipments,
  locations,
  onSaved,
  onClose,
  onPlaceRestored,
}: {
  /** null: a new shipment */
  shipment: Shipment | null
  shipments: Shipment[]
  locations: Location[]
  onSaved: (result: ShipmentUpdateResult) => void
  onClose: () => void
  /** a place moved to the nearest road for lorries was put back where it was */
  onPlaceRestored: (place: Location) => void
}) {
  const api = useApi()
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const first = useRef<HTMLInputElement>(null)
  const [initial] = useState(() => (shipment ? toFormValues(shipment, locations) : emptyFormValues()))
  const [values, setValues] = useState<ShipmentFormValues>(initial)
  const [errors, setErrors] = useState<ShipmentFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isNew = shipment === null

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    // showModal focuses the first button (the X); the first place is where typing starts.
    first.current?.focus()
  }, [])

  const set = <K extends keyof ShipmentFormValues>(field: K, value: ShipmentFormValues[K]) =>
    setValues((previous) => ({ ...previous, [field]: value }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const built = shipment ? buildShipmentPatch(values, initial) : buildShipmentInput(values)
    if (!built.ok) {
      setErrors(built.errors)
      setFormError(null)
      return
    }
    setErrors({})
    setFormError(null)
    setSaving(true)
    try {
      const result =
        'patch' in built ? await api.updateShipment(shipment!.id, built.patch) : await api.createShipment(built.input)
      // Closed first, so focus goes back to the button that opened the window.
      ref.current?.close()
      onSaved(result)
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
    const locationId = shipment ? (role === 'pickup' ? shipment.pickupLocationId : shipment.deliveryLocationId) : null
    return (
      <PlaceEditor
        role={role}
        idPrefix={id}
        isNew={isNew}
        inputRef={role === 'pickup' ? first : undefined}
        location={locations.find((l) => l.id === locationId)}
        others={shipment && locationId !== null ? otherShipmentsAt(locationId, shipments, shipment.id) : 0}
        value={values[role]}
        initial={initial[role]}
        onChange={(value) => set(role, value)}
        fieldProps={fieldProps}
        fieldError={fieldError}
        onRestored={(restored) => {
          ref.current?.close()
          onPlaceRestored(restored)
        }}
      />
    )
  }

  const title = shipment ? `Izmena pošiljke ${shipment.externalId}` : 'Nova pošiljka'
  return (
    <dialog
      ref={ref}
      className="dialog dialog--wide"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      // Not while saving: the answer would come to a window that is gone.
      onCancel={(event) => saving && event.preventDefault()}
    >
      <form className="shipment-form" onSubmit={handleSubmit} noValidate aria-label={title}>
        <div className="dialog__header">
          <h2 id={`${id}-title`}>{title}</h2>
          <button
            type="button"
            className="button--ghost dialog__x"
            onClick={() => ref.current?.close()}
            disabled={saving}
            aria-label="Zatvori"
            title="Zatvori"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="shipment-form__grid">
          {place('pickup')}
          {place('delivery')}
          <fieldset className="field">
            <legend>Pošiljka</legend>
            <div className="field">
              <label htmlFor={`${id}-externalId`}>{isNew ? 'ID (neobavezno)' : 'ID'}</label>
              <input {...fieldProps('externalId')} value={values.externalId} onChange={(e) => set('externalId', e.target.value)} />
              {fieldError('externalId') ??
                (isNew && <span className="field__hint">Prazno: naziv po relaciji, npr. KRA-STE-1.</span>)}
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
        <p className="text--muted shipment-form__note">
          {isNew
            ? 'Pri čuvanju se koordinate mesta traže po nazivu, kao pri uvozu Excel-a; poznato mesto zadržava svoje.'
            : 'Pri čuvanju se koordinate traže samo za mesta ove pošiljke koja ih nemaju. Upisan naziv se traži ponovo i ako ranije nije pronađen; za mesto koje ovde nije menjano koristi se zapamćen odgovor.'}
          {apiMode() === 'local' && (
            <>
              {' '}
              <OsmAttribution />
            </>
          )}
        </p>
        {formError && (
          <p role="alert" className="text--error">
            {isNew ? 'Pošiljka nije dodata' : 'Izmena nije sačuvana'}: {formError}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="button--primary" disabled={saving}>
            {saving ? 'Čuvanje…' : isNew ? 'Dodaj pošiljku' : 'Sačuvaj izmenu'}
          </button>
          <button type="button" onClick={() => ref.current?.close()} disabled={saving}>
            Otkaži
          </button>
        </div>
      </form>
    </dialog>
  )
}

const LEGENDS: Record<PlaceRole, string> = { pickup: 'Preuzimanje', delivery: 'Isporuka' }

function PlaceEditor({
  role,
  idPrefix,
  isNew,
  inputRef,
  location,
  others,
  value,
  initial,
  onChange,
  fieldProps,
  fieldError,
  onRestored,
}: {
  role: PlaceRole
  idPrefix: string
  /** the place of a shipment entered by hand: it has no place yet */
  isNew: boolean
  inputRef?: Ref<HTMLInputElement>
  /** the place the shipment has now */
  location: Location | undefined
  /** other shipments at that place */
  others: number
  value: PlaceFormValues
  initial: PlaceFormValues
  onChange: (value: PlaceFormValues) => void
  fieldProps: (field: ShipmentFormField) => FieldProps
  fieldError: (field: ShipmentFormField) => ReactNode
  onRestored: (place: Location) => void
}) {
  const api = useApi()
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  async function restore(place: Location) {
    setRestoring(true)
    setRestoreError(null)
    try {
      onRestored(await api.restoreRoadPoint(place.id))
    } catch (error) {
      setRestoreError(`Mesto nije vraćeno: ${describeError(error)}`)
      setRestoring(false)
    }
  }
  const set = <K extends keyof PlaceFormValues>(field: K, text: PlaceFormValues[K]) => onChange({ ...value, [field]: text })
  const prefix = `${idPrefix}-${role}`
  const coordinatesField = `${role}Coordinates` as const
  const located = location && location.lat !== null && location.lon !== null ? { lat: location.lat, lon: location.lon } : null
  const replaced = placeReplaced(value, initial)
  return (
    <fieldset className="field">
      <legend>{LEGENDS[role]}</legend>
      <p className="row-editor__place-status">
        {isNew ? (
          <span className="text--muted">Grad ili mesto, kao u Excel-u.</span>
        ) : located ? (
          <>
            Koordinate: {formatCoordinates(located)}
            {location?.movedFrom ? (
              <>
                {' '}
                (pomereno do puta za kamione, {formatKm(haversineMeters(location.movedFrom, located))} od izvorne tačke){' '}
                <button
                  type="button"
                  className="button--small"
                  onClick={() => void restore(location)}
                  disabled={restoring}
                >
                  {restoring ? 'Vraćanje…' : 'Vrati izvornu tačku'}
                </button>
              </>
            ) : (
              location?.geocodeStatus === 'MANUAL' && ' (ručno uneta lokacija)'
            )}
            {restoreError && (
              <span role="alert" className="text--error">
                {' '}
                {restoreError}
              </span>
            )}
          </>
        ) : (
          <span className="text--error">Nema koordinata (nejasna lokacija).</span>
        )}
      </p>
      <div className="field">
        <label htmlFor={`${idPrefix}-${role}`}>Mesto</label>
        <input {...fieldProps(role)} ref={inputRef} value={value.name} onChange={(e) => set('name', e.target.value)} />
        {fieldError(role)}
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-country`}>{isNew ? 'Zemlja (neobavezno)' : 'Zemlja'}</label>
        <CountrySelect id={`${prefix}-country`} value={value.country} onChange={(code) => set('country', code)} />
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
      {!isNew && !located && replaced && others > 0 && (
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
