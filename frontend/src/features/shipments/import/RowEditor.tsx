import { useId, useState, type FormEvent } from 'react'
import { useApi } from '../../../api/apiContext'
import { describeError } from '../../../api/client'
import type { ImportRow, ImportRowPatch, PlaceGuess } from '../../../api/types'
import { formatLdm, parseLdmTenths } from '../../../format/units'

interface PlaceFields {
  name: string
  postalCode: string
  country: string
}

const toFields = (place: PlaceGuess | null): PlaceFields => ({
  name: place?.name ?? '',
  postalCode: place?.postalCode ?? '',
  country: place?.country ?? '',
})

const samePlace = (fields: PlaceFields, place: PlaceGuess | null) => {
  const original = toFields(place)
  return (
    fields.name.trim() === original.name &&
    fields.postalCode.trim() === original.postalCode &&
    fields.country.trim().toUpperCase() === original.country
  )
}

/** Manual correction of one import row; only changed fields are sent. */
export function RowEditor({
  importId,
  row,
  onSaved,
  onCancel,
}: {
  importId: number
  row: ImportRow
  onSaved: () => void
  onCancel: () => void
}) {
  const api = useApi()
  const id = useId()
  const [externalId, setExternalId] = useState(row.externalId)
  const [pickup, setPickup] = useState(() => toFields(row.pickup))
  const [delivery, setDelivery] = useState(() => toFields(row.delivery))
  const [ldm, setLdm] = useState(row.ldmTenths === null ? '' : formatLdm(row.ldmTenths))
  const [ldmError, setLdmError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const patch: ImportRowPatch = {}
    if (externalId.trim() !== row.externalId) patch.externalId = externalId.trim()
    if (!samePlace(pickup, row.pickup)) patch.pickup = { name: pickup.name, postalCode: pickup.postalCode, country: pickup.country }
    if (!samePlace(delivery, row.delivery)) {
      patch.delivery = { name: delivery.name, postalCode: delivery.postalCode, country: delivery.country }
    }
    const ldmTenths = parseLdmTenths(ldm)
    if (ldmTenths === null || ldmTenths <= 0) {
      setLdmError('Unesite LDM veći od 0, sa najviše jednom decimalom (npr. 2,4).')
      return
    }
    if (ldmTenths !== row.ldmTenths) patch.ldmTenths = ldmTenths
    setLdmError(null)

    if (Object.keys(patch).length === 0) {
      onCancel()
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.updateImportRow(importId, row.rowNumber, patch)
      onSaved()
    } catch (e) {
      setFormError(describeError(e))
      setSaving(false)
    }
  }

  return (
    <form className="row-editor" onSubmit={handleSubmit} noValidate aria-label={`Ispravka reda ${row.rowNumber}`}>
      <p className="text--muted row-editor__source">
        Red {row.rowNumber} u fajlu: „{row.sourceText}“
      </p>
      <div className="row-editor__grid">
        <PlaceEditor legend="Preuzimanje" idPrefix={`${id}-pickup`} value={pickup} onChange={setPickup} />
        <PlaceEditor legend="Isporuka" idPrefix={`${id}-delivery`} value={delivery} onChange={setDelivery} />
        <fieldset className="field">
          <legend>Pošiljka</legend>
          <div className="field">
            <label htmlFor={`${id}-externalId`}>ID</label>
            <input id={`${id}-externalId`} value={externalId} onChange={(e) => setExternalId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-ldm`}>LDM</label>
            <input
              id={`${id}-ldm`}
              inputMode="decimal"
              value={ldm}
              onChange={(e) => setLdm(e.target.value)}
              aria-invalid={ldmError ? true : undefined}
              aria-describedby={ldmError ? `${id}-ldm-error` : undefined}
            />
            {ldmError && (
              <span id={`${id}-ldm-error`} className="field__error">
                {ldmError}
              </span>
            )}
          </div>
        </fieldset>
      </div>
      {formError && (
        <p role="alert" className="text--error">
          Ispravka nije sačuvana: {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={saving}>
          {saving ? 'Čuvanje…' : 'Sačuvaj ispravku'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Otkaži
        </button>
      </div>
    </form>
  )
}

function PlaceEditor({
  legend,
  idPrefix,
  value,
  onChange,
}: {
  legend: string
  idPrefix: string
  value: PlaceFields
  onChange: (value: PlaceFields) => void
}) {
  const set = (field: keyof PlaceFields) => (text: string) => onChange({ ...value, [field]: text })
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Mesto</label>
        <input id={`${idPrefix}-name`} value={value.name} onChange={(e) => set('name')(e.target.value)} />
      </div>
      <div className="field-row field-row--2">
        <div className="field">
          <label htmlFor={`${idPrefix}-postal`}>Poštanski broj</label>
          <input
            id={`${idPrefix}-postal`}
            inputMode="numeric"
            value={value.postalCode}
            onChange={(e) => set('postalCode')(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-country`}>Zemlja</label>
          <input id={`${idPrefix}-country`} value={value.country} onChange={(e) => set('country')(e.target.value)} />
        </div>
      </div>
    </fieldset>
  )
}
