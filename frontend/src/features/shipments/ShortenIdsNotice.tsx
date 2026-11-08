import { useState } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { Location, Shipment } from '../../api/types'
import { Notice } from '../../components/Notice'
import { fileNameIdRenames } from '../../domain/shipmentIds'

/**
 * Offers short names by relation for shipments whose name an earlier import made from the
 * file name and the row. Which ones is a guess, so it shows examples and asks first.
 */
export function ShortenIdsNotice({
  shipments,
  locations,
  onRenamed,
}: {
  shipments: Shipment[]
  locations: Location[]
  onRenamed: (renamed: number) => void
}) {
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const renames = fileNameIdRenames(shipments, locations)
  if (renames.length === 0) return null

  async function shorten() {
    setBusy(true)
    setError(null)
    try {
      onRenamed((await api.shortenShipmentIds()).renamed)
    } catch (e) {
      setError(describeError(e))
    }
    setBusy(false)
  }

  return (
    <Notice tone="info" title={`Dugački nazivi pošiljki (${renames.length})`} role="status">
      <p>
        Ove pošiljke imaju naziv napravljen od imena Excel fajla i broja reda. Mogu dobiti kratak naziv po relaciji
        (prva slova mesta utovara i istovara i broj), kakav sada dobija svaki nov uvoz:
      </p>
      <ul className="notice__list">
        {renames.slice(0, 3).map((r) => (
          <li key={r.shipmentId}>
            {r.from} → <strong>{r.to}</strong>
          </li>
        ))}
        {renames.length > 3 && <li>i još {renames.length - 3}</li>}
      </ul>
      {error && (
        <p role="alert" className="text--error">
          Skraćivanje nije uspelo: {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="button--primary" onClick={() => void shorten()} disabled={busy}>
          {busy ? 'Skraćivanje…' : 'Skrati nazive'}
        </button>
      </div>
    </Notice>
  )
}
