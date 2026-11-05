import { useId, useState, type FormEvent } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import { ADMIN_PASSWORD } from './adminPassword'
import { keepForReload } from './afterReload'
import { SettingsPart } from './SettingsPart'

/**
 * The factory reset, at the bottom of the settings: everything on the device goes, as on the
 * first start, once the administrator's password is given. Then the page reloads, so every
 * screen starts from nothing.
 */
export function FactoryResetPanel() {
  const api = useApi()
  const id = useId()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== ADMIN_PASSWORD) {
      setError('Pogrešna lozinka. Ništa nije obrisano.')
      return
    }
    setError(null)
    setResetting(true)
    try {
      await api.resetDevice()
      keepForReload('Svi podaci na uređaju su obrisani; aplikacija je kao pri prvom pokretanju.')
      window.location.reload()
    } catch (problem) {
      setError(`Brisanje nije uspelo: ${describeError(problem)}`)
      setResetting(false)
    }
  }

  return (
    <div className="panel panel--cherry factory-reset">
      <SettingsPart
        n={5}
        title="Brisanje svih podataka"
        about={
          <>
            <p className="text--muted">
              Briše sve na ovom uređaju: pošiljke, kamione i tipove, rezultate, zapamćene koordinate i kilometraže,
              podešavanja i ključ za OpenRouteService. Aplikacija je posle toga kao pri prvom pokretanju.
            </p>
            <p className="text--muted">
              Ovo se ne može poništiti. Ako vam podaci trebaju, prvo ih izvezite (iznad, „Izvezi podatke“).
            </p>
          </>
        }
      >
        <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label="Brisanje svih podataka">
          <div className="field">
            <label htmlFor={`${id}-password`}>Administratorska lozinka</label>
            <input
              id={`${id}-password`}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error && (
              <span id={`${id}-error`} className="field__error" role="alert">
                {error}
              </span>
            )}
          </div>
          <div className="form-actions">
            <button type="submit" className="button--primary" disabled={resetting || password === ''}>
              {resetting ? 'Brisanje…' : 'Obriši sve podatke'}
            </button>
          </div>
        </form>
      </SettingsPart>
    </div>
  )
}
