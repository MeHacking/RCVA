import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { Truck } from '../../api/types'
import { Icon } from '../../components/Icon'
import { parsePhone } from '../../format/phone'

/**
 * Asked for when a truck's driver has no phone number and the PDF is to go to Viber: the
 * number is saved on the truck (for the next time too), then the sending goes on.
 */
export function ViberPhoneDialog({
  truck,
  onSaved,
  onClose,
}: {
  truck: Truck
  /** the number as saved on the truck */
  onSaved: (phone: string) => void
  onClose: () => void
}) {
  const api = useApi()
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    // showModal focuses the first button (the X); the number is what is asked for.
    input.current?.focus()
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parsePhone(phone)
    if (parsed === null || parsed === 'invalid') {
      setError(
        parsed === null ? 'Unesite broj telefona vozača.' : 'Unesite broj sa pozivnim brojem zemlje, npr. +381 64 123 4567.',
      )
      return
    }
    setError(null)
    setSaving(true)
    try {
      // The truck as it is, with the number; its location is kept by the API.
      const saved = await api.updateTruck(truck.id, {
        name: truck.name,
        capacityLdmTenths: truck.capacityLdmTenths,
        capacityKg: truck.capacityKg,
        available: truck.available,
        innerLengthMm: truck.innerLengthMm,
        innerWidthMm: truck.innerWidthMm,
        innerHeightMm: truck.innerHeightMm,
        driverName: truck.driverName,
        driverPhone: parsed,
      })
      onSaved(saved.driverPhone ?? parsed)
    } catch (e) {
      setError(e instanceof ApiError && e.problem.errors?.driverPhone ? e.problem.errors.driverPhone : describeError(e))
      setSaving(false)
    }
  }

  return (
    <dialog ref={ref} className="dialog dialog--narrow" aria-labelledby={`${id}-title`} onClose={onClose}>
      <form onSubmit={save} noValidate>
        <div className="dialog__header">
          <h2 id={`${id}-title`}>Broj telefona vozača</h2>
          <button
            type="button"
            className="button--ghost dialog__x"
            onClick={() => ref.current?.close()}
            aria-label="Zatvori"
            title="Zatvori"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <p>
          Kamion <strong>{truck.name}</strong> nema broj telefona vozača
          {truck.driverName ? ` (${truck.driverName})` : ''}, pa se PDF ne može poslati na Viber. Unesite broj; čuva se
          uz kamion i za sledeći put.
        </p>
        <div className="field">
          <label htmlFor={`${id}-phone`}>Telefon vozača (za Viber)</label>
          <input
            ref={input}
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="npr. +381 64 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          {error && (
            <span id={`${id}-error`} className="field__error">
              {error}
            </span>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" className="button--primary" disabled={saving}>
            {saving ? 'Čuvanje…' : 'Sačuvaj i pošalji'}
          </button>
          <button type="button" onClick={() => ref.current?.close()} disabled={saving}>
            Otkaži
          </button>
        </div>
      </form>
    </dialog>
  )
}
