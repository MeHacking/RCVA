import { useState } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { Location, PlaceSearchResult } from '../../api/types'
import { haversineMeters } from '../../domain/optimization/distance'
import { formatCoordinates } from '../../format/coordinates'
import { formatKm } from '../../format/units'

/**
 * Looks a place that already has coordinates up again in the country chosen in the form, for
 * one found in the wrong town. Nothing changes until the user accepts what was found.
 */
export function PlaceSearchAgain({
  location,
  point,
  country,
  others,
  onApplied,
}: {
  location: Location
  /** where the place is now */
  point: { lat: number; lon: number }
  country: string
  /** other shipments at the place */
  others: number
  onApplied: (place: Location) => void
}) {
  const api = useApi()
  const [result, setResult] = useState<PlaceSearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run<T>(work: () => Promise<T>, done: (value: T) => void) {
    setBusy(true)
    setError(null)
    try {
      done(await work())
    } catch (e) {
      setError(describeError(e))
    }
    setBusy(false)
  }

  const found = result?.found
  return (
    <div className="place-search">
      {found ? (
        <div className="place-search__result" role="status">
          <p>
            <strong>Pronađeno:</strong> {found.label}
          </p>
          <p className="text--muted">
            {formatCoordinates(found)}, {formatKm(haversineMeters(point, found))} od sadašnje tačke
          </p>
          <p className="text--muted">
            Važi za sve pošiljke sa ovim mestom{others > 0 && ` (još ${others})`}. Sačuvani rezultati zadržavaju ranije
            kilometre.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="button--small button--primary"
              disabled={busy}
              onClick={() => void run(() => api.applyPlaceSearch(location.id, { ...found, country: result.country }), onApplied)}
            >
              Prihvati
            </button>
            <button type="button" className="button--small" disabled={busy} onClick={() => setResult(null)}>
              Odustani
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="button--small"
            disabled={busy}
            onClick={() => void run(() => api.searchPlaceAgain(location.id, country), setResult)}
          >
            {busy ? 'Traženje…' : 'Traži ponovo'}
          </button>
          {result ? (
            <span className="field__hint" role="status">
              „{result.name}“ nije pronađeno {result.country ? 'u izabranoj državi' : 'ni u jednoj državi'}. Mesto ostaje kakvo
              jeste.
            </span>
          ) : (
            <span className="field__hint">Ako je mesto pronađeno u pogrešnom gradu: izaberite državu i potražite ga ponovo.</span>
          )}
        </>
      )}
      {error && (
        <span role="alert" className="text--error">
          {error}
        </span>
      )}
    </div>
  )
}
