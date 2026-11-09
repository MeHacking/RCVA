import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApi } from '../../api/apiContext'
import { apiMode } from '../../api/apiMode'
import { describeError } from '../../api/client'
import type { Shipment, ShipmentUpdateResult } from '../../api/types'
import { Badge, type BadgeTone } from '../../components/Badge'
import { Icon } from '../../components/Icon'
import { Notice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { ShortenIdsNotice } from './ShortenIdsNotice'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { CSV_BOM } from '../../format/csv'
import { formatDimensionsMm, formatKg, formatLdm } from '../../format/units'
import { useAsyncData } from '../../hooks/useAsyncData'
import { downloadText } from '../../utils/download'
import {
  buildShipmentRows,
  SHIPMENT_STATUS_LABELS,
  shipmentTotals,
  type ShipmentRow,
  type ShipmentStatus,
} from './shipmentRows'
import { ShipmentDialog } from './ShipmentDialog'
import { describeUpdate } from './shipmentEditModel'
import { shipmentsCsvFileName, shipmentsToCsv } from './shipmentsCsv'

// The backend has no "remove all shipments", no corrections and no shipments by hand; the
// mock and the device do.
const CAN_DELETE_ALL = apiMode() !== 'server'
const CAN_EDIT = apiMode() !== 'server'
// Weight limits a truck's load only in the application on the device (B2).
const WEIGHT_HINT = apiMode() === 'local' ? 'Zbir po kamionu ne sme preći nosivost' : 'Informativno; nije ograničenje u optimizaciji'

const STATUS_TONES: Record<ShipmentStatus, BadgeTone> = {
  OK: 'success',
  MANUAL: 'info',
  LOCATION_ERROR: 'danger',
}

/** The window open over the page: a new shipment (null) or the one being corrected. */
type Editing = { shipment: Shipment | null }

/** The last thing done to one shipment, told above the table. */
type Done = { kind: 'saved'; result: ShipmentUpdateResult; created: boolean } | { kind: 'removed'; externalId: string }

export function ShipmentsPage() {
  const api = useApi()
  const navigate = useNavigate()
  const load = useCallback(async () => {
    const [shipments, locations] = await Promise.all([api.listShipments(), api.listLocations()])
    return { shipments, locations, rows: buildShipmentRows(shipments, locations) }
  }, [api])
  const [loaded, reload] = useAsyncData(load)
  const rows = loaded.status === 'success' ? loaded.data.rows : null
  const [done, setDone] = useState<Done | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [shortened, setShortened] = useState<number | null>(null)

  async function deleteAll() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteAllShipments()
      setConfirming(false)
      setDone(null)
      reload()
    } catch (error) {
      setDeleteError(describeError(error))
    }
    setDeleting(false)
  }

  const exportCsv = () => {
    if (!rows) return
    downloadText(shipmentsCsvFileName(new Date()), CSV_BOM + shipmentsToCsv(rows), 'text/csv;charset=utf-8')
  }

  return (
    <section>
      <PageHeader
        title="Pošiljke"
        actions={
          <>
            <button type="button" onClick={exportCsv} disabled={!rows || rows.length === 0}>
              Izvezi CSV
            </button>
            {CAN_DELETE_ALL && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!rows || rows.length === 0 || confirming}
              >
                Ukloni sve pošiljke
              </button>
            )}
            {CAN_EDIT && (
              <button type="button" onClick={() => setEditing({ shipment: null })} disabled={!rows}>
                <Icon name="plus" size={16} />
                Dodaj pošiljku
              </button>
            )}
            <button type="button" className="button--primary" onClick={() => navigate('/shipments/import')}>
              Uvezi Excel
            </button>
          </>
        }
      />

      {confirming && rows && (
        <Notice tone="warning" title={`Ukloniti sve pošiljke (${rows.length})?`} role="status">
          <p>
            Brišu se pošiljke i mesta koja više nijedan rezultat ne koristi. Kamioni, poslednji rezultati i zapamćene
            koordinate i kilometraže ostaju, pa se nova nedelja uvozi kao nov Excel.
            {apiMode() === 'local' && (
              <>
                {' '}
                Ako želite kopiju sadašnjih podataka, prvo ih <Link to="/settings">izvezite u Podešavanjima</Link>.
              </>
            )}
          </p>
          {deleteError && (
            <p role="alert" className="text--error">
              Uklanjanje nije uspelo: {deleteError}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="button--danger" onClick={() => void deleteAll()} disabled={deleting}>
              {deleting ? 'Uklanjanje…' : 'Da, ukloni sve'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={deleting}>
              Otkaži
            </button>
          </div>
        </Notice>
      )}

      {done?.kind === 'saved' && <SavedNotice result={done.result} created={done.created} />}
      {done?.kind === 'removed' && (
        <Notice tone="success" title={`Pošiljka „${done.externalId}“ je uklonjena.`} role="status">
          <p>Sačuvani rezultati optimizacije se ne menjaju.</p>
        </Notice>
      )}

      {loaded.status === 'loading' && <LoadingState label="Učitavanje pošiljki…" />}
      {loaded.status === 'error' && <ErrorState title="Pošiljke nisu učitane" message={loaded.message} onRetry={reload} />}
      {loaded.status === 'success' &&
        (loaded.data.rows.length === 0 ? (
          <EmptyState title="Nema unetih pošiljki">
            Pošiljke se unose uvozom Excel fajla: kliknite „Uvezi Excel“, izaberite fajl, povežite kolone,
            ispravite redove sa greškom i potvrdite upis.
            {CAN_EDIT && ' Pojedinačna pošiljka se unosi ručno dugmetom „Dodaj pošiljku“.'}
          </EmptyState>
        ) : (
          <>
            {CAN_EDIT && (
              <ShortenIdsNotice
                shipments={loaded.data.shipments}
                locations={loaded.data.locations}
                onRenamed={(renamed) => {
                  setShortened(renamed)
                  reload()
                }}
              />
            )}
            {shortened !== null && (
              <Notice tone="success" title={`Skraćeno naziva: ${shortened}`} role="status">
                <p>Rezultati i spiskovi sada prikazuju nove nazive.</p>
              </Notice>
            )}
            <ShipmentTable
              rows={loaded.data.rows}
              editingId={editing?.shipment?.id ?? null}
              onEdit={(id) => {
                const shipment = loaded.data.shipments.find((s) => s.id === id)
                if (shipment) setEditing({ shipment })
              }}
              onRemoved={(externalId) => {
                setDone({ kind: 'removed', externalId })
                reload()
              }}
            />
          </>
        ))}

      {editing && loaded.status === 'success' && (
        <ShipmentDialog
          // A new window for every shipment opened, so the form starts from its values.
          key={editing.shipment?.id ?? 'new'}
          shipment={editing.shipment}
          shipments={loaded.data.shipments}
          locations={loaded.data.locations}
          onSaved={(result) => {
            setEditing(null)
            setDone({ kind: 'saved', result, created: editing.shipment === null })
            reload()
          }}
          onClose={() => setEditing(null)}
          onPlaceRestored={() => {
            setEditing(null)
            setDone(null)
            reload()
          }}
        />
      )}
    </section>
  )
}

function SavedNotice({ result, created }: { result: ShipmentUpdateResult; created: boolean }) {
  const { tone, title, lines } = describeUpdate(result, { created })
  return (
    <Notice tone={tone} title={title} role="status">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </Notice>
  )
}

function ShipmentTable({
  rows,
  editingId,
  onEdit,
  onRemoved,
}: {
  rows: ShipmentRow[]
  /** the shipment open in the window, if any */
  editingId: number | null
  onEdit: (id: number) => void
  /** a shipment was removed (load the shipments again) */
  onRemoved: (externalId: string) => void
}) {
  const api = useApi()
  const totals = shipmentTotals(rows)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function remove(row: ShipmentRow) {
    setDeletingId(row.id)
    setDeleteError(null)
    try {
      await api.deleteShipment(row.id)
      setConfirmingId(null)
      onRemoved(row.externalId)
    } catch (error) {
      setDeleteError(`Pošiljka „${row.externalId}“ nije uklonjena: ${describeError(error)}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <p className="table-summary text--muted">
        Pošiljki: <strong>{totals.count}</strong> · ukupno <strong>{formatLdm(totals.ldmTenths)} LDM</strong> · sa
        greškom: <strong className={totals.withErrors > 0 ? 'text--error' : undefined}>{totals.withErrors}</strong>
      </p>
      {deleteError && (
        <p role="alert" className="text--error">
          {deleteError}
        </p>
      )}
      <div className="table-wrap">
        <table className="table" aria-label="Pošiljke">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Preuzimanje</th>
              <th scope="col">Isporuka</th>
              <th scope="col" className="num">
                LDM
              </th>
              <th scope="col" className="num" title={WEIGHT_HINT}>
                Težina (kg)
              </th>
              <th scope="col">Dimenzije (D × Š × V)</th>
              <th scope="col">Status</th>
              {CAN_EDIT && (
                <th scope="col">
                  <span className="visually-hidden">Akcije</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} aria-current={row.id === editingId ? 'true' : undefined}>
                <td>{row.externalId}</td>
                <td>{row.pickupName}</td>
                <td>{row.deliveryName}</td>
                <td className="num">{formatLdm(row.ldmTenths)}</td>
                <td className="num">
                  {row.weightKg === null ? <span className="text--muted">–</span> : formatKg(row.weightKg)}
                </td>
                <td>
                  {formatDimensionsMm(row.lengthMm, row.widthMm, row.heightMm) ?? (
                    <span className="text--muted">nije uneto</span>
                  )}
                </td>
                <td>
                  <Badge tone={STATUS_TONES[row.status]}>{SHIPMENT_STATUS_LABELS[row.status]}</Badge>
                </td>
                {CAN_EDIT && (
                  <td className="actions">
                    {confirmingId === row.id ? (
                      <span
                        className="confirm-inline"
                        role="group"
                        aria-label={`Potvrda uklanjanja: pošiljka ${row.externalId}`}
                      >
                        <span>Ukloniti pošiljku?</span>
                        <button
                          type="button"
                          className="button--danger button--small"
                          onClick={() => void remove(row)}
                          disabled={deletingId === row.id}
                        >
                          {deletingId === row.id ? 'Uklanjanje…' : 'Da, ukloni'}
                        </button>
                        <button
                          type="button"
                          className="button--small"
                          onClick={() => setConfirmingId(null)}
                          disabled={deletingId === row.id}
                        >
                          Otkaži
                        </button>
                      </span>
                    ) : (
                      <span className="confirm-inline">
                        <button
                          type="button"
                          className="button--small"
                          onClick={() => onEdit(row.id)}
                          aria-haspopup="dialog"
                          aria-label={`Izmeni pošiljku ${row.externalId}`}
                        >
                          Izmeni
                        </button>
                        <button
                          type="button"
                          className="button--small button--primary"
                          onClick={() => {
                            setDeleteError(null)
                            setConfirmingId(row.id)
                          }}
                          aria-label={`Ukloni pošiljku ${row.externalId}`}
                        >
                          <Icon name="trash" size={14} />
                          Ukloni
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
