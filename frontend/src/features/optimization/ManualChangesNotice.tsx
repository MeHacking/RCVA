import { useState } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { OptimizationResult } from '../../api/types'
import { Notice } from '../../components/Notice'
import { formatKm } from '../../format/units'

/** A result changed by hand: what it costs against the optimizer's, and the way back to it. */
export function ManualChangesNotice({
  jobId,
  result,
  onChanged,
}: {
  jobId: number
  result: OptimizationResult
  onChanged: (result: OptimizationResult) => void
}) {
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!result.manual) return null

  const difference = result.totalMeters - result.manual.optimizedMeters
  const compared =
    difference === 0
      ? 'isto kao predlog optimizacije'
      : `${difference > 0 ? '+' : '−'}${formatKm(Math.abs(difference))} u odnosu na predlog optimizacije (${formatKm(result.manual.optimizedMeters)})`

  async function restore() {
    setBusy(true)
    setError(null)
    try {
      onChanged(await api.restoreOptimizedResult(jobId))
    } catch (problem) {
      setError(describeError(problem))
      setBusy(false)
    }
  }

  return (
    <Notice tone="info" title="Raspored je ručno izmenjen" role="status">
      <p>
        Ukupno {formatKm(result.totalMeters)}: {compared}. Rute, popunjenost, 3D prikaz i PDF prate izmene.
      </p>
      {error && (
        <p role="alert" className="text--error">
          {error}
        </p>
      )}
      <div className="notice__actions">
        <button type="button" className="button--small" onClick={() => void restore()} disabled={busy}>
          {busy ? 'Vraćanje…' : 'Vrati predlog optimizacije'}
        </button>
      </div>
    </Notice>
  )
}
