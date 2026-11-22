import { Car, Database, MapPin, MapPinOff, Palette, Route, Trash2, Truck, type LucideIcon } from 'lucide-react'
import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { DeviceSettings, OrsProfile } from '../../api/types'
import { OsmAttribution } from '../../components/OsmAttribution'
import { PageHeader } from '../../components/PageHeader'
import { SectionNav, type NavPart } from '../../components/SectionNav'
import { useScrollSpy } from '../../hooks/useScrollSpy'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useAsyncData } from '../../hooks/useAsyncData'
import { DeviceDataPanel } from './DeviceDataPanel'
import { FactoryResetPanel } from './FactoryResetPanel'
import { ForgetPlacesPanel } from './ForgetPlacesPanel'
import { SettingsPart, type PartRef } from './SettingsPart'
import { ThemePanel } from './ThemePanel'

/** The look; the browser's own, so it is there whatever the data source says. */
const LOOK: NavPart = { id: 'izgled', title: 'Izgled', icon: Palette }

/** The parts the application on the device has, in the contents as in smartLoad+ (owner, 22.11.2026). */
const DEVICE_PARTS: NavPart[] = [
  { id: 'koordinate', title: 'Koordinate mesta', icon: MapPin },
  { id: 'kilometraze', title: 'Kilometraže', icon: Route },
  { id: 'dodatni-kamion', title: 'Dodatni kamion', icon: Truck },
  { id: 'podaci', title: 'Podaci na uređaju', icon: Database },
  { id: 'lokacije', title: 'Zaboravljanje lokacija', icon: MapPinOff },
  { id: 'brisanje', title: 'Brisanje podataka', icon: Trash2 },
]

/**
 * Settings of the application on the device; the mock and the backend have none. Laid out as in
 * smartLoad+: a card per part on the left, and the contents beside them that follow the reading.
 */
export function SettingsPage() {
  const api = useApi()
  const load = useCallback(() => api.getDeviceSettings(), [api])
  const [settings, reload] = useAsyncData(load)
  const onDevice = settings.status === 'success' && settings.data !== null
  const parts = onDevice ? [LOOK, ...DEVICE_PARTS] : [LOOK]
  const { active, goTo, partRef } = useScrollSpy(parts.map((p) => p.id))

  return (
    <section className="settings">
      <PageHeader title="Podešavanja" note="Izgled, podaci i servisi" />
      <div className="section-layout">
        <div className="settings__parts">
          <ThemePanel partRef={partRef} />
          {settings.status === 'loading' && <LoadingState label="Učitavanje podešavanja…" />}
          {settings.status === 'error' && (
            <ErrorState title="Podešavanja nisu učitana" message={settings.message} onRetry={reload} />
          )}
          {settings.status === 'success' &&
            (settings.data ? (
              <>
                <SettingsForm initial={settings.data} partRef={partRef} />
                <DeviceDataPanel partRef={partRef} />
                <ForgetPlacesPanel partRef={partRef} />
                <FactoryResetPanel partRef={partRef} />
              </>
            ) : (
              <EmptyState title="Nema podešavanja">Podešavanja postoje samo u aplikaciji na uređaju.</EmptyState>
            ))}
        </div>
        <SectionNav parts={parts} active={active} goTo={goTo} label="Delovi podešavanja" />
      </div>
    </section>
  )
}

/** The vehicles whose roads OpenRouteService follows, as a switch of two pills (owner, 22.11.2026). */
const PROFILES: Array<{ value: OrsProfile; label: string; icon: LucideIcon }> = [
  { value: 'driving-hgv', label: 'teretna vozila', icon: Truck },
  { value: 'driving-car', label: 'automobile', icon: Car },
]

type Field = 'contactEmail' | 'orsApiKey' | 'orsProfile' | 'extraTruckSavingPercent'

function SettingsForm({ initial, partRef }: { initial: DeviceSettings; partRef: PartRef }) {
  const api = useApi()
  const id = useId()
  const [geocodingEnabled, setGeocodingEnabled] = useState(initial.geocodingEnabled)
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? '')
  const [orsApiKey, setOrsApiKey] = useState(initial.orsApiKey ?? '')
  const [orsProfile, setOrsProfile] = useState<OrsProfile>(initial.orsProfile)
  const [savingPercent, setSavingPercent] = useState(
    initial.extraTruckSavingPercent === null ? '' : String(initial.extraTruckSavingPercent),
  )
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
        // Empty: no advice; anything but a whole number is refused by the device with the reason.
        extraTruckSavingPercent: savingPercent.trim() === '' ? null : Number(savingPercent.trim()),
      })
      setContactEmail(stored.contactEmail ?? '')
      setSavingPercent(stored.extraTruckSavingPercent === null ? '' : String(stored.extraTruckSavingPercent))
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
    <span id={`${id}-${field}-hint`} className="field__hint">
      {text}
    </span>
  )

  return (
    <form className="settings-form" onSubmit={handleSubmit} noValidate aria-label="Podešavanja aplikacije">
      <SettingsPart
        id="koordinate"
        icon={MapPin}
        title="Koordinate mesta"
        partRef={partRef}
        about={
          <>
            <p className="text--muted">
              Pri potvrdi uvoza aplikacija traži koordinate novih mesta preko javnog servisa Nominatim (OpenStreetMap),
              najviše jedno mesto u sekundi.
            </p>
            <p className="text--muted">
              Svaki odgovor se pamti na uređaju i isto mesto se više ne traži. Šalje se samo naziv mesta i oznaka
              zemlje. <OsmAttribution />
            </p>
          </>
        }
      >
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
          {hint(
            'contactEmail',
            'Šalje se uz svaki upit, da bi vas operateri servisa mogli kontaktirati ako nešto nije u redu.',
          )}
          {fieldError('contactEmail')}
        </div>
      </SettingsPart>

      <SettingsPart
        id="kilometraze"
        icon={Route}
        title="Kilometraže"
        partRef={partRef}
        about={
          <>
            <p className="text--muted">
              Sa ključem za OpenRouteService optimizacija računa kilometre po putu, a mapa crta rute po putu; bez ključa
              računa vazdušnu liniju, i rezultat to piše.
            </p>
            <p className="text--muted">
              Šalju se samo koordinate mesta, i samo ono što još nije izračunato; kilometraže i linije se pamte na
              uređaju. Besplatan ključ je na nalogu na{' '}
              <a href="https://account.heigit.org" target="_blank" rel="noreferrer">
                account.heigit.org
              </a>{' '}
              (kartica „API Key“).
            </p>
          </>
        }
      >
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

        <fieldset
          className="field"
          aria-invalid={errors.orsProfile ? true : undefined}
          aria-describedby={described('orsProfile', false)}
        >
          <legend>Putevi za</legend>
          <div className="switch-bar">
            {PROFILES.map(({ value, label, icon: Glyph }) => (
              <label key={value} className="switch-bar__option">
                <input
                  type="radio"
                  name={`${id}-orsProfile`}
                  className="visually-hidden"
                  value={value}
                  checked={orsProfile === value}
                  onChange={() => setOrsProfile(value)}
                />
                <Glyph aria-hidden="true" />
                {label}
              </label>
            ))}
          </div>
          {fieldError('orsProfile')}
        </fieldset>
      </SettingsPart>

      <SettingsPart
        id="dodatni-kamion"
        icon={Truck}
        title="Preporuka dodatnog kamiona"
        partRef={partRef}
        about={
          <p className="text--muted">
            Posle optimizacije aplikacija proba i sa jednim kamionom više i predloži ga kada je kilometara bar toliko
            posto manje.
          </p>
        }
      >
        <div className="field">
          <label htmlFor={`${id}-extraTruckSavingPercent`}>Preporuka dodatnog kamiona: najmanja ušteda (%)</label>
          <input
            id={`${id}-extraTruckSavingPercent`}
            inputMode="numeric"
            value={savingPercent}
            onChange={(e) => setSavingPercent(e.target.value)}
            aria-invalid={errors.extraTruckSavingPercent ? true : undefined}
            aria-describedby={described('extraTruckSavingPercent', true)}
          />
          {hint('extraTruckSavingPercent', 'Prazno = bez preporuke (tada celo zadato vreme ide na rešenje).')}
          {fieldError('extraTruckSavingPercent')}
        </div>
      </SettingsPart>

      <div className="settings-form__footer">
        <p className="text--muted">Koordinate mesta, kilometraže i preporuka dodatnog kamiona čuvaju se zajedno.</p>
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
        <button type="submit" className="button--primary" disabled={saving}>
          {saving ? 'Čuvanje…' : 'Sačuvaj'}
        </button>
      </div>
    </form>
  )
}
