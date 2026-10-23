import { useId, useState, type ChangeEvent } from 'react'
import { useApi } from '../../../api/apiContext'
import { describeError } from '../../../api/client'
import type { ImportCreated } from '../../../api/types'
import { ErrorState, LoadingState } from '../../../components/states'

export function FileStep({ onUploaded }: { onUploaded: (upload: ImportCreated) => void }) {
  const api = useApi()
  const id = useId()
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow choosing the same file again after an error
    if (!file) return
    setError(null)
    setUploading(file.name)
    try {
      onUploaded(await api.createImport(file))
    } catch (e) {
      setError(describeError(e))
      setUploading(null)
    }
  }

  return (
    <div className="panel">
      <h2>Izaberite Excel fajl</h2>
      <p className="text--muted">
        Podržan je .xlsx. Fajl može imati jednu kolonu sa relacijom (npr. „NOVI SAD 34131 - LJUNGBY“) ili posebne
        kolone za preuzimanje i isporuku; kolone se povezuju u sledećem koraku.
      </p>
      <div className="field file-field">
        <label htmlFor={`${id}-file`}>Fajl</label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleChange}
          disabled={uploading !== null}
        />
      </div>
      {uploading && <LoadingState label={`Učitavanje „${uploading}“…`} />}
      {error && <ErrorState title="Fajl nije učitan" message={error} />}
    </div>
  )
}
