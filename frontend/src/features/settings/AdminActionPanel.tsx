import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { describeError } from '../../api/client'
import { ADMIN_PASSWORD } from './adminPassword'
import { keepForReload } from './afterReload'
import { SettingsPart } from './SettingsPart'

/**
 * Something at the bottom of the settings that cannot be undone, done once the administrator's
 * password is given. Then the page reloads, so every screen starts from the data as it is now.
 */
export function AdminActionPanel({
  n,
  title,
  about,
  action,
  act,
}: {
  n: number
  title: string
  about: ReactNode
  /** the button */
  action: string
  /** does it; resolves to the message shown after the reload */
  act: () => Promise<string>
}) {
  const id = useId()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== ADMIN_PASSWORD) {
      setError('Pogrešna lozinka. Ništa nije obrisano.')
      return
    }
    setError(null)
    setWorking(true)
    try {
      keepForReload(await act())
      window.location.reload()
    } catch (problem) {
      setError(`Brisanje nije uspelo: ${describeError(problem)}`)
      setWorking(false)
    }
  }

  return (
    <div className="panel panel--cherry factory-reset">
      <SettingsPart n={n} title={title} about={about}>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label={title}>
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
            <button type="submit" className="button--primary" disabled={working || password === ''}>
              {working ? 'Brisanje…' : action}
            </button>
          </div>
        </form>
      </SettingsPart>
    </div>
  )
}
