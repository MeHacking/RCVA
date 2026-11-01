import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { DeviceDataSummary } from '../../api/types'
import { Notice } from '../../components/Notice'
import { formatDateTime } from '../../format/time'

// Export and import of all data on the device (step 4d): the only backup of what the
// browser keeps, and the way to move it to another device. An import first checks the
// whole file and shows what it holds; the data is replaced only after a confirmation, and
// then the page reloads, so every screen starts from the new data.

/** Survives the reload after an import, so the page can say what was imported. */
const IMPORTED_KEY = 'rcva-imported'

type ImportState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'review'; fileName: string; content: string; summary: DeviceDataSummary }
  | { kind: 'replacing'; fileName: string; content: string; summary: DeviceDataSummary }
  | { kind: 'error'; message: string }

export function DeviceDataPanel() {
  const api = useApi()
  const id = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [exported, setExported] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [state, setState] = useState<ImportState>({ kind: 'idle' })
  // Read on the first render, removed after it, so the message shows once.
  const [imported, setImported] = useState<string | null>(() => storage((s) => s.getItem(IMPORTED_KEY)))
  useEffect(() => {
    storage((s) => s.removeItem(IMPORTED_KEY))
  }, [])

  async function exportData() {
    setExported(null)
    setExportError(null)
    try {
      const file = await api.exportDeviceData()
      if (!file) return
      const url = URL.createObjectURL(new Blob([file.content], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = file.fileName
      link.click()
      URL.revokeObjectURL(url)
      setExported(file.fileName)
    } catch (error) {
      setExportError(describeError(error))
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImported(null)
    setState({ kind: 'checking' })
    try {
      const content = await file.text()
      const summary = await api.checkDeviceData(content)
      setState({ kind: 'review', fileName: file.name, content, summary })
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) })
    }
  }

  async function replace() {
    if (state.kind !== 'review') return
    setState({ ...state, kind: 'replacing' })
    try {
      const summary = await api.replaceDeviceData(state.content)
      const message = `Podaci su uvezeni iz fajla ${state.fileName} (izvezen ${formatDateTime(summary.exportedAt)}).`
      storage((s) => s.setItem(IMPORTED_KEY, message))
      window.location.reload()
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) })
    }
  }

  const review = state.kind === 'review' || state.kind === 'replacing' ? state : null

  return (
    <section className="panel device-data" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Podaci na uređaju</h2>
      <p className="text--muted">
        Pošiljke, kamioni i rezultati čuvaju se samo u ovom pregledaču: brisanje podataka sajta briše sve. „Izvezi
        podatke“ pravi jedan fajl sa svim podacima i zapamćenim koordinatama, kilometražama i linijama po putu, ali bez
        ključa za OpenRouteService. Taj fajl je rezervna kopija i način da se podaci prenesu na drugi uređaj.
      </p>

      <div className="form-actions">
        <button type="button" onClick={() => void exportData()}>
          Izvezi podatke
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={state.kind === 'checking' || state.kind === 'replacing'}>
          Uvezi podatke…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Fajl sa podacima"
          onChange={(e) => void chooseFile(e)}
        />
      </div>

      {exported && (
        <p role="status" className="text--success">
          Napravljen je fajl {exported}.
        </p>
      )}
      {exportError && (
        <p role="alert" className="text--error">
          Izvoz nije uspeo: {exportError}
        </p>
      )}
      {imported && (
        <p role="status" className="text--success">
          {imported}
        </p>
      )}
      {state.kind === 'checking' && <p role="status">Provera fajla…</p>}
      {state.kind === 'error' && (
        <p role="alert" className="text--error">
          Fajl nije uvezen: {state.message} Podaci na uređaju nisu menjani.
        </p>
      )}

      {review && (
        <Notice tone="warning" title="Uvoz zamenjuje sve podatke na uređaju" role="status">
          <p>
            Fajl {review.fileName}, izvezen {formatDateTime(review.summary.exportedAt)}, sadrži:
          </p>
          <ul className="device-data__summary" aria-label="Sadržaj fajla">
            <li>pošiljke: {review.summary.shipments}</li>
            <li>mesta: {review.summary.locations}</li>
            <li>kamioni: {review.summary.trucks}</li>
            <li>rezultati optimizacije: {review.summary.results}</li>
            <li>
              zapamćene koordinate: {review.summary.geocodes}, kilometraže: {review.summary.distances}, linije po putu:{' '}
              {review.summary.routeLines}
            </li>
          </ul>
          <p>Sadašnji podaci na ovom uređaju se brišu. Ključ za OpenRouteService ostaje.</p>
          <div className="form-actions">
            <button type="button" className="button--danger" onClick={() => void replace()} disabled={state.kind === 'replacing'}>
              {state.kind === 'replacing' ? 'Uvoz…' : 'Zameni podatke'}
            </button>
            <button type="button" onClick={() => setState({ kind: 'idle' })} disabled={state.kind === 'replacing'}>
              Odustani
            </button>
          </div>
        </Notice>
      )}
    </section>
  )
}

/** sessionStorage may be blocked; the message after an import is only a convenience. */
function storage<T>(act: (s: Storage) => T): T | null {
  try {
    return act(sessionStorage)
  } catch {
    return null
  }
}
