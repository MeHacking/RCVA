import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { DeviceSettings, OrsProfile } from '../../api/types'
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

type Field = 'contactEmail' | 'orsApiKey' | 'orsProfile'

function SettingsForm({ initial }: { initial: DeviceSettings }) {
  const api = useApi()
  const id = useId()
  const [geocodingEnabled, setGeocodingEnabled] = useState(initial.geocodingEnabled)
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? '')
  const [orsApiKey, setOrsApiKey] = useState(initial.orsApiKey ?? '')
  const [orsProfile, setOrsProfile] = useState<OrsProfile>(initial.orsProfile)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setErrors({})
    setFormError(null)
    try {
      const stored = await api.updateDeviceSettings({
        geocodingEnabled,
        contactEmail: contactEmail.trim() || null,
        orsApiKey: orsApiKey.trim() || null,
        orsProfile,
      })
      setContactEmail(stored.contactEmail ?? '')
      setOrsApiKey(stored.orsApiKey ?? '')
      setSaved(true)
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.problem.errors) {
        setErrors(error.problem.errors)
      } else {
        setFormError(describeError(error))
      }
    }
    setSaving(false)
  }

  const described = (field: Field, hint: boolean) =>
    [hint && `${id}-${field}-hint`, errors[field] && `${id}-${field}-error`].filter(Boolean).join(' ') || undefined
  const fieldError = (field: Field) =>
    errors[field] && (
      <span id={`${id}-${field}-error`} className="field__error">
        {errors[field]}
      </span>
    )
  const hint = (field: Field, text: ReactNode) => (
    <span id={`${id}-${field}-hint`} className="text--muted">
      {text}
    </span>
  )

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
        <label htmlFor={`${id}-contactEmail`}>E-adresa za Nominatim (neobavezno)</label>
        <input
          id={`${id}-contactEmail`}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          aria-invalid={errors.contactEmail ? true : undefined}
          aria-describedby={described('contactEmail', true)}
        />
        {hint('contactEmail', 'Šalje se uz svaki upit, da bi vas operateri servisa mogli kontaktirati ako nešto nije u redu.')}
        {fieldError('contactEmail')}
      </div>

      <h2 className="settings-form__section">Kilometraže</h2>
      <p className="text--muted">
        Sa ključem za OpenRouteService optimizacija računa kilometre po putu; bez ključa računa vazdušnu liniju, i
        rezultat to piše. Pri pokretanju se šalju samo koordinate mesta, i samo za parove mesta koji još nisu
        izračunati; kilometraže se pamte na uređaju. Besplatan ključ se pravi na{' '}
        <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noreferrer">
          openrouteservice.org
        </a>
        .
      </p>

      <div className="field">
        <label htmlFor={`${id}-orsApiKey`}>Ključ za OpenRouteService</label>
        <input
          id={`${id}-orsApiKey`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={orsApiKey}
          onChange={(e) => setOrsApiKey(e.target.value)}
          aria-invalid={errors.orsApiKey ? true : undefined}
          aria-describedby={described('orsApiKey', true)}
        />
        {hint('orsApiKey', 'Čuva se samo na ovom uređaju. Prazno = vazdušna linija.')}
        {fieldError('orsApiKey')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-orsProfile`}>Putevi za</label>
        <select
          id={`${id}-orsProfile`}
          value={orsProfile}
          onChange={(e) => setOrsProfile(e.target.value as OrsProfile)}
          aria-invalid={errors.orsProfile ? true : undefined}
          aria-describedby={described('orsProfile', false)}
        >
          <option value="driving-hgv">teretna vozila</option>
          <option value="driving-car">automobile</option>
        </select>
        {fieldError('orsProfile')}
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
