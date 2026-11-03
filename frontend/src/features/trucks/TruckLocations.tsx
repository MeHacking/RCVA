import { Fragment, useId, useState, type FormEvent } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { Location, Truck, TruckStart, TruckStartInput, TruckStartResult } from '../../api/types'
import { Badge } from '../../components/Badge'
import { OsmAttribution } from '../../components/OsmAttribution'
import { formatCoordinates, parseCoordinates } from '../../format/coordinates'

/**
 * Where each truck is (only on the device): a job's routes start there. The last delivery of
 * a newer job is only proposed; it is used once the user confirms it, or the user keeps the
 * present location or types another place.
 */
export function TruckLocations({
  trucks,
  starts,
  onChanged,
}: {
  trucks: Truck[]
  starts: TruckStart[]
  /** after every saved change, so the caller loads the trucks and locations again */
  onChanged: () => void
}) {
  const api = useApi()
  const [editing, setEditing] = useState<number | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const [messages, setMessages] = useState<Record<number, { tone: 'success' | 'error'; text: string }>>({})
  const byTruck = new Map(starts.map((s) => [s.truckId, s]))

  async function save(truck: Truck, input: TruckStartInput) {
    setPending(truck.id)
    try {
      const result = await api.setTruckStart(truck.id, input)
      setMessages((m) => ({ ...m, [truck.id]: describeResult(result) }))
      onChanged()
    } catch (error) {
      setMessages((m) => ({ ...m, [truck.id]: { tone: 'error', text: describeError(error) } }))
    } finally {
      setPending(null)
    }
  }

  // Running a job again (e.g. the same week with another time limit) proposes every truck's last
  // delivery again; these answer all of them at once.
  const proposed = trucks.filter((t) => byTruck.get(t.id)?.proposal)
  const keepable = proposed.filter((t) => byTruck.get(t.id)?.location)
  async function answerAll(answer: (truck: Truck) => TruckStartInput) {
    for (const truck of proposed) await save(truck, answer(truck))
  }

  return (
    <>
      {proposed.length > 1 && (
        <div className="form-actions truck-locations__all">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => void answerAll((t) => ({ proposalJobId: byTruck.get(t.id)!.proposal!.jobId }))}
          >
            Potvrdi sve predloge ({proposed.length})
          </button>
          {keepable.length === proposed.length && (
            <button type="button" disabled={pending !== null} onClick={() => void answerAll(() => ({ keep: true }))}>
              Zadrži sve sadašnje lokacije
            </button>
          )}
        </div>
      )}
      <div className="table-wrap">
        <table className="table" aria-label="Lokacije kamiona">
          <thead>
            <tr>
              <th scope="col">Kamion</th>
              <th scope="col">Sada je</th>
              <th scope="col">Predlog</th>
              <th scope="col">
                <span className="visually-hidden">Akcije</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {trucks.map((truck) => {
              const start = byTruck.get(truck.id)
              const message = messages[truck.id]
              const busy = pending === truck.id
              return (
                <Fragment key={truck.id}>
                  <tr>
                    <td>
                      {truck.name}
                      {!truck.available && <span className="text--muted"> · nedostupan</span>}
                    </td>
                    <td>
                      {start?.location ? <PlaceName location={start.location} /> : <Badge tone="danger">Nije uneta</Badge>}
                      {message && (
                        <p className={message.tone === 'error' ? 'text--error' : 'text--muted'} role="status">
                          {message.text}
                        </p>
                      )}
                    </td>
                    <td>
                      {start?.proposal ? (
                        <div className="truck-proposal">
                          <span>
                            <PlaceName location={start.proposal.location} />
                            <span className="text--muted"> · poslednja isporuka u optimizaciji #{start.proposal.jobId}</span>
                          </span>
                          <div className="truck-proposal__actions">
                            <button
                              type="button"
                              className="button--small button--primary"
                              onClick={() => void save(truck, { proposalJobId: start.proposal!.jobId })}
                              disabled={busy}
                              aria-label={`Potvrdi predlog za ${truck.name}`}
                            >
                              Potvrdi predlog
                            </button>
                            {start.location && (
                              <button
                                type="button"
                                className="button--small"
                                onClick={() => void save(truck, { keep: true })}
                                disabled={busy}
                                aria-label={`Zadrži sadašnju lokaciju za ${truck.name}`}
                              >
                                Zadrži sadašnju
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text--muted">–</span>
                      )}
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="button--small"
                        onClick={() => setEditing(editing === truck.id ? null : truck.id)}
                        aria-expanded={editing === truck.id}
                        aria-label={`Unesi lokaciju za ${truck.name}`}
                        disabled={busy}
                      >
                        Unesi mesto
                      </button>
                    </td>
                  </tr>
                  {editing === truck.id && (
                    <tr className="table__editor-row">
                      <td colSpan={4}>
                        <PlaceForm
                          truck={truck}
                          onSaved={(result) => {
                            setMessages((m) => ({ ...m, [truck.id]: describeResult(result) }))
                            // A place that was not found stays open, to type another name or coordinates.
                            if (result.outcome !== 'notFound' && result.outcome !== 'failed') setEditing(null)
                            onChanged()
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PlaceName({ location }: { location: Location }) {
  const coordinates = location.lat !== null && location.lon !== null ? formatCoordinates({ lat: location.lat, lon: location.lon }) : null
  return (
    <span title={coordinates ?? undefined}>
      {location.name}
      {location.country && <span className="text--muted"> · {location.country}</span>}
    </span>
  )
}

function describeResult(result: TruckStartResult): { tone: 'success' | 'error'; text: string } {
  const name = `„${result.name}“`
  switch (result.outcome) {
    case 'notFound':
      return { tone: 'error', text: `${name} nije pronađeno; upišite drugi naziv ili koordinate. Lokacija nije promenjena.` }
    case 'failed':
      return { tone: 'error', text: `Koordinate za ${name} nisu tražene: ${result.message ?? 'nepoznata greška.'} Lokacija nije promenjena.` }
    case 'manual':
      return { tone: 'success', text: `Sačuvano: ${name}, koordinate unete ručno.` }
    default:
      return { tone: 'success', text: `Sačuvano: ${name}.` }
  }
}

function PlaceForm({ truck, onSaved, onCancel }: { truck: Truck; onSaved: (result: TruckStartResult) => void; onCancel: () => void }) {
  const api = useApi()
  const id = useId()
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [coordinates, setCoordinates] = useState('')
  const [errors, setErrors] = useState<{ place?: string; coordinates?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseCoordinates(coordinates)
    const found: typeof errors = {}
    if (!name.trim()) found.place = 'Unesite mesto.'
    if (parsed === 'invalid') found.coordinates = 'Unesite širinu i dužinu, npr. 45.2671, 19.8335.'
    setErrors(found)
    if (Object.keys(found).length > 0 || parsed === 'invalid') return
    setSaving(true)
    setFormError(null)
    try {
      const result = await api.setTruckStart(truck.id, {
        place: { name: name.trim(), postalCode: null, country: country.trim().toUpperCase() || null, ...(parsed ? { coordinates: parsed } : {}) },
      })
      onSaved(result)
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.problem.errors) setErrors(error.problem.errors)
      setFormError(describeError(error))
    } finally {
      setSaving(false)
    }
  }

  const fieldProps = (field: 'place' | 'coordinates') => ({
    id: `${id}-${field}`,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined,
  })

  return (
    <form className="row-editor" onSubmit={handleSubmit} noValidate aria-label={`Lokacija kamiona ${truck.name}`}>
      <div className="row-editor__grid">
        <div className="field">
          <label htmlFor={`${id}-place`}>Mesto</label>
          <input {...fieldProps('place')} value={name} onChange={(e) => setName(e.target.value)} />
          {errors.place && (
            <span id={`${id}-place-error`} className="field__error">
              {errors.place}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${id}-country`}>Zemlja</label>
          <input id={`${id}-country`} placeholder="npr. RS" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-coordinates`}>Koordinate (ručno, neobavezno)</label>
          <input
            {...fieldProps('coordinates')}
            inputMode="decimal"
            placeholder="npr. 45.2671, 19.8335"
            value={coordinates}
            onChange={(e) => setCoordinates(e.target.value)}
          />
          {errors.coordinates ? (
            <span id={`${id}-coordinates-error`} className="field__error">
              {errors.coordinates}
            </span>
          ) : (
            <span className="field__hint">Širina, dužina (kao u Google mapama); samo ako se mesto ne pronađe.</span>
          )}
        </div>
      </div>
      <p className="text--muted row-editor__note">
        Mesto koje aplikacija već zna se ne traži; novo se traži preko Nominatim-a. <OsmAttribution />
      </p>
      {formError && (
        <p role="alert" className="text--error">
          Lokacija nije sačuvana: {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={saving}>
          {saving ? 'Čuvanje…' : 'Sačuvaj lokaciju'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Otkaži
        </button>
      </div>
    </form>
  )
}
