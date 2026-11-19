import { useRef, useState, type ChangeEvent } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { Shipment, ShipmentLayoutPreview } from '../../api/types'
import { Icon } from '../../components/Icon'
import { Notice } from '../../components/Notice'
import { formatDateTime } from '../../format/time'
import { formatKg, formatLdm } from '../../format/units'
import type { CargoSpaceMm } from './scene'

// A layout from smartLoad+ for the chosen shipment (only on the device): the file is checked
// first and what it changes is shown; the shipment changes only after "Primeni". The layout
// then places the shipment in every truck and result, and gives it its LDM and weight.

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'review' | 'applying'; fileName: string; content: string; preview: ShipmentLayoutPreview }
  | { kind: 'removing' }
  | { kind: 'error'; message: string }

export interface LayoutImportProps {
  shipment: Shipment
  /** the layout the shipment has now */
  current: { name: string; pieces: number } | null
  /** the truck on the screen, to say whether the layout fits it */
  space: CargoSpaceMm
  onApplied: (shipment: Shipment, message: string) => void
  onRemoved: (message: string) => void
}

export function LayoutImport({ shipment, current, space, onApplied, onRemoved }: LayoutImportProps) {
  const api = useApi()
  const fileInput = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const name = shipment.externalId

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setState({ kind: 'checking' })
    try {
      const content = await file.text()
      const preview = await api.checkShipmentLayout(shipment.id, content)
      setState({ kind: 'review', fileName: file.name, content, preview })
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) })
    }
  }

  async function apply() {
    if (state.kind !== 'review') return
    setState({ ...state, kind: 'applying' })
    try {
      const changed = await api.applyShipmentLayout(shipment.id, state.content)
      const { before, after, layout } = state.preview
      const rerun =
        before.ldmTenths !== after.ldmTenths ? ' Pokrenite optimizaciju ponovo, da bi rute računale novi LDM.' : ''
      setState({ kind: 'idle' })
      onApplied(
        changed,
        `Raspored „${layout.name}“ je uvezen za pošiljku ${name}: ${formatLdm(after.ldmTenths)} LDM, ${formatKg(after.weightKg)} kg.${rerun}`,
      )
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) })
    }
  }

  async function remove() {
    setState({ kind: 'removing' })
    try {
      await api.removeShipmentLayout(shipment.id)
      setState({ kind: 'idle' })
      onRemoved(`Pošiljka ${name} je ponovo jedan blok; LDM i težina ostaju kao posle uvoza.`)
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) })
    }
  }

  const review = state.kind === 'review' || state.kind === 'applying' ? state : null
  const busy = state.kind === 'checking' || state.kind === 'applying' || state.kind === 'removing'

  return (
    <section className="panel layout-import" aria-labelledby="layout-import-title">
      <h2 id="layout-import-title">Raspored iz smartLoad+: {name}</h2>
      <p className="text--muted">
        Fajl koji je napravilo „Izvezi raspored (JSON)“ u smartLoad+ postavlja komade na mesto ove pošiljke, u svakom
        kamionu i rezultatu. Pošiljka dobija dužinu i težinu iz rasporeda.
      </p>
      {current && (
        <p>
          Pošiljka ima raspored „{current.name}“ ({current.pieces} komada).
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Icon name="upload" size={16} />
          {current ? 'Uvezi drugi raspored…' : 'Uvezi raspored iz smartLoad+…'}
        </button>
        {current && (
          <button type="button" className="button--danger" onClick={() => void remove()} disabled={busy}>
            {state.kind === 'removing' ? 'Uklanjanje…' : 'Ukloni uvezeni raspored'}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Fajl sa rasporedom iz smartLoad+"
          onChange={(e) => void chooseFile(e)}
        />
      </div>

      {state.kind === 'checking' && <p role="status">Provera fajla…</p>}
      {state.kind === 'error' && (
        <p role="alert" className="text--error">
          Raspored nije uvezen: {state.message} Pošiljka nije menjana.
        </p>
      )}

      {review && (
        <Notice tone="info" title={`Raspored „${review.preview.layout.name}“`} role="status">
          <ReviewDetails fileName={review.fileName} preview={review.preview} space={space} />
          <div className="form-actions">
            <button type="button" className="button--primary" onClick={() => void apply()} disabled={state.kind === 'applying'}>
              {state.kind === 'applying' ? 'Primena…' : 'Primeni'}
            </button>
            <button type="button" onClick={() => setState({ kind: 'idle' })} disabled={state.kind === 'applying'}>
              Odustani
            </button>
          </div>
        </Notice>
      )}
    </section>
  )
}

function ReviewDetails({ fileName, preview, space }: { fileName: string; preview: ShipmentLayoutPreview; space: CargoSpaceMm }) {
  const { layout, before, after, replaces } = preview
  const warnings = [
    layout.widthMm > space.innerWidthMm &&
      `Raspored je širi od tovarnog prostora ovog kamiona (${layout.widthMm} mm > ${space.innerWidthMm} mm).`,
    layout.heightMm > space.innerHeightMm &&
      `Raspored je viši od tovarnog prostora ovog kamiona (${layout.heightMm} mm > ${space.innerHeightMm} mm).`,
    layout.unplacedPieces > 0 && `U smartLoad+ nije stalo komada: ${layout.unplacedPieces}.`,
  ].filter((w): w is string => typeof w === 'string')
  const weight = (kg: number | null) => (kg === null ? 'nije uneta' : `${formatKg(kg)} kg`)
  return (
    <>
      <p>
        Fajl {fileName}, izvezen {formatDateTime(layout.exportedAt)}: {layout.pieces.length} komada.
      </p>
      <ul className="layout-import__changes" aria-label="Šta se menja">
        <li>
          LDM: {formatLdm(before.ldmTenths)} → {formatLdm(after.ldmTenths)}
        </li>
        <li>
          Težina: {weight(before.weightKg)} → {weight(after.weightKg)}
        </li>
      </ul>
      {replaces && <p>Zamenjuje raspored „{replaces}“.</p>}
      {warnings.length > 0 && (
        <ul className="notice__list" aria-label="Upozorenja">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </>
  )
}
