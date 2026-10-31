import { useCallback, useId, useState, type FormEvent } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { DeviceSettings } from '../../api/types'
import { OsmAttribution } from '../../components/OsmAttribution'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useAsyncData } from '../../hooks/useAsyncData'

/** Settings of the application on the device; the mock and the backend have none. */
export function SettingsPage() {
  const api = useApi()
  const load = useCallback(() => api.getDeviceSettings(), [api])
  const [settings, reload] = useAsyncData(load)

  return (
    <section>
      <PageHeader title="Podešavanja" />
      {settings.status === 'loading' && <LoadingState label="Učitavanje podešavanja…" />}
      {settings.status === 'error' && (
        <ErrorState title="Podešavanja nisu učitana" message={settings.message} onRetry={reload} />
      )}
      {settings.status === 'success' &&
        (settings.data ? (
          <SettingsForm initial={settings.data} />
        ) : (
          <EmptyState title="Nema podešavanja">Podešavanja postoje samo u aplikaciji na uređaju.</EmptyState>
        ))}
    </section>
  )
}

function SettingsForm({ initial }: { initial: DeviceSettings }) {
  const api = useApi()
  const id = useId()
  const [geocodingEnabled, setGeocodingEnabled] = useState(initial.geocodingEnabled)
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? '')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setEmailError(null)
    setFormError(null)
    try {
      const stored = await api.updateDeviceSettings({ geocodingEnabled, contactEmail: contactEmail.trim() || null })
      setContactEmail(stored.contactEmail ?? '')
      setSaved(true)
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.problem.errors?.contactEmail) {
        setEmailError(error.problem.errors.contactEmail)
      } else {
        setFormError(describeError(error))
      }
    }
    setSaving(false)
  }

  return (
    <form className="panel settings-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Koordinate mesta</h2>
      <p className="text--muted">
        Pri potvrdi uvoza aplikacija traži koordinate novih mesta preko javnog servisa Nominatim (OpenStreetMap),
        najviše jedno mesto u sekundi. Svaki odgovor se pamti na uređaju i isto mesto se više ne traži. Šalje se samo
        naziv mesta i oznaka zemlje. <OsmAttribution />
      </p>

      <div className="field field--checkbox">
        <input
          id={`${id}-geocoding`}
          type="checkbox"
          checked={geocodingEnabled}
          onChange={(e) => setGeocodingEnabled(e.target.checked)}
        />
        <label htmlFor={`${id}-geocoding`}>Traži koordinate preko Nominatim-a</label>
      </div>

      <div className="field">
        <label htmlFor={`${id}-email`}>E-adresa za Nominatim (neobavezno)</label>
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={`${id}-email-hint${emailError ? ` ${id}-email-error` : ''}`}
        />
        <span id={`${id}-email-hint`} className="text--muted">
          Šalje se uz svaki upit, da bi vas operateri servisa mogli kontaktirati ako nešto nije u redu.
        </span>
        {emailError && (
          <span id={`${id}-email-error`} className="field__error">
            {emailError}
          </span>
        )}
      </div>

      {formError && (
        <p role="alert" className="text--error">
          Čuvanje nije uspelo: {formError}
        </p>
      )}
      {saved && (
        <p role="status" className="text--success">
          Podešavanja su sačuvana.
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={saving}>
          {saving ? 'Čuvanje…' : 'Sačuvaj'}
        </button>
      </div>
    </form>
  )
}
