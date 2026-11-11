import { useState } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { OptimizationResult } from '../../api/types'

/** Moving shipments between the trucks of a result by hand (only on the device). */
export interface Reassign {
  jobId: number
  /** the trucks of the job, empty ones too */
  targets: Array<{ id: number; name: string }>
  onChanged: (result: OptimizationResult) => void
}

/**
 * A list to move one shipment to another truck, or off its truck (`truckId` null: it is on
 * none, so it can only be added). Whatever does not fit is refused, with the reason.
 */
export function MoveShipment({
  reassign,
  shipmentId,
  label,
  truckId,
}: {
  reassign: Reassign
  shipmentId: number
  label: string
  truckId: number | null
}) {
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function move(value: string) {
    if (value === '') return
    setBusy(true)
    setError(null)
    try {
      // The row moves away with the shipment, so nothing more is set here.
      reassign.onChanged(await api.reassignShipment(reassign.jobId, shipmentId, value === 'out' ? null : Number(value)))
    } catch (problem) {
      setError(problem instanceof ApiError && problem.status === 400 ? problem.message : describeError(problem))
      setBusy(false)
    }
  }

  return (
    <div className="move-shipment">
      <select
        aria-label={truckId === null ? `Dodaj ${label} u kamion` : `Premesti ${label}`}
        value=""
        disabled={busy}
        onChange={(e) => void move(e.target.value)}
      >
        <option value="">{truckId === null ? 'Dodaj u…' : 'Premesti u…'}</option>
        {reassign.targets
          .filter((t) => t.id !== truckId)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        {truckId !== null && <option value="out">Izbaci iz kamiona</option>}
      </select>
      {error && (
        <span role="alert" className="field__error">
          {error}
        </span>
      )}
    </div>
  )
}
