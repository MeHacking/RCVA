import { useCallback, useState } from 'react'
import { useApi } from '../../../api/apiContext'
import { describeError } from '../../../api/client'
import type { ImportCommitProgress, ImportCommitResult } from '../../../api/types'
import { OsmAttribution } from '../../../components/OsmAttribution'
import { ErrorState, LoadingState } from '../../../components/states'
import { formatLdm } from '../../../format/units'
import { useAsyncData } from '../../../hooks/useAsyncData'
import { summarizeImport } from './importHelpers'

interface ConfirmStepProps {
  importId: number
  fileName: string
  onBack: () => void
  onCommitted: (result: ImportCommitResult) => void
}

export function ConfirmStep({ importId, fileName, onBack, onCommitted }: ConfirmStepProps) {
  const api = useApi()
  // Loaded fresh, so the numbers match what the server will commit even if the
  // previous step moved on before its last refresh arrived.
  const load = useCallback(() => api.getImportPreview(importId), [api, importId])
  const [preview, reload] = useAsyncData(load)
  // Only the application on the device looks up coordinates (null: the mock and the backend).
  const loadSettings = useCallback(() => api.getDeviceSettings(), [api])
  const [settings] = useAsyncData(loadSettings)
  const geocodingEnabled = settings.status === 'success' ? (settings.data?.geocodingEnabled ?? null) : null
  const [saving, setSaving] = useState(false)
  /** the coordinate lookup on the device; never set over HTTP */
  const [progress, setProgress] = useState<ImportCommitProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (preview.status === 'loading') return <LoadingState label="Priprema potvrde…" />
  if (preview.status === 'error') return <ErrorState title="Pregled nije učitan" message={preview.message} onRetry={reload} />

  const { rows } = preview.data
  const summary = summarizeImport(rows)
  const readyLdm = rows
    .filter((r) => !r.excluded && r.errors.length === 0)
    .reduce((sum, r) => sum + (r.ldmTenths ?? 0), 0)

  async function commit() {
    setSaving(true)
    setError(null)
    setProgress(null)
    try {
      onCommitted(await api.commitImport(importId, { onProgress: setProgress }))
    } catch (e) {
      setError(describeError(e))
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <h2>Potvrda uvoza</h2>
      <ul className="confirm-list">
        <li>
          Fajl: <strong>{fileName}</strong>
        </li>
        <li>
          Biće upisano pošiljki: <strong>{summary.ready}</strong> (ukupno {formatLdm(readyLdm)} LDM)
          {summary.corrected > 0 && `, od toga ručno ispravljenih: ${summary.corrected}`}
        </li>
        <li>
          Preskače se redova: <strong>{summary.withErrors + summary.excluded}</strong> (sa greškom:{' '}
          {summary.withErrors}, isključeno: {summary.excluded})
        </li>
      </ul>
      {summary.withErrors > 0 && (
        <p className="text--warning">
          Redovi sa greškom se ne upisuju. Vratite se na pregled da ih ispravite ili isključite.
        </p>
      )}
      {geocodingEnabled === true && (
        <p className="text--muted">
          Koordinate novih mesta se traže preko servisa Nominatim, najviše jedno mesto u sekundi; odgovori se pamte na
          uređaju. <OsmAttribution />
        </p>
      )}
      {geocodingEnabled === false && (
        <p className="text--warning">
          Traženje koordinata je isključeno u podešavanjima; nova mesta će biti bez koordinata.
        </p>
      )}
      {saving && progress && progress.total > 0 && (
        <p role="status">
          Traženje koordinata: {progress.done} od {progress.total} mesta
        </p>
      )}
      {error && <ErrorState title="Uvoz nije upisan" message={error} />}
      <div className="form-actions wizard-actions">
        <button type="button" onClick={onBack} disabled={saving}>
          Nazad na pregled
        </button>
        <button type="button" className="button--primary" onClick={() => void commit()} disabled={saving || summary.ready === 0}>
          {saving ? 'Upisivanje…' : `Upiši pošiljke (${summary.ready})`}
        </button>
      </div>
    </div>
  )
}
