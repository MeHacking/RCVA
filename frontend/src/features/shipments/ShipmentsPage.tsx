import { Fragment, useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApi } from '../../api/apiContext'
import { apiMode } from '../../api/apiMode'
import { describeError } from '../../api/client'
import type { Location, Shipment, ShipmentUpdateResult } from '../../api/types'
import { Badge, type BadgeTone } from '../../components/Badge'
import { Notice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
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
import { ShipmentEditor } from './ShipmentEditor'
import { describeUpdate } from './shipmentEditModel'
import { shipmentsCsvFileName, shipmentsToCsv } from './shipmentsCsv'

// The backend has no "remove all shipments" and no corrections; the mock and the device do.
const CAN_DELETE_ALL = apiMode() !== 'server'
const CAN_EDIT = apiMode() !== 'server'
// Weight limits a truck's load only in the application on the device (B2).
const WEIGHT_HINT = apiMode() === 'local' ? 'Zbir po kamionu ne sme preći nosivost' : 'Informativno; nije ograničenje u optimizaciji'

const STATUS_TONES: Record<ShipmentStatus, BadgeTone> = {
  OK: 'success',
  MANUAL: 'info',
  LOCATION_ERROR: 'danger',
}

export function ShipmentsPage() {
  const api = useApi()
  const navigate = useNavigate()
  const load = useCallback(async () => {
    const [shipments, locations] = await Promise.all([api.listShipments(), api.listLocations()])
    return { shipments, locations, rows: buildShipmentRows(shipments, locations) }
  }, [api])
  const [loaded, reload] = useAsyncData(load)
  const rows = loaded.status === 'success' ? loaded.data.rows : null
  const [saved, setSaved] = useState<ShipmentUpdateResult | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function deleteAll() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteAllShipments()
      setConfirming(false)
      setSaved(null)
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

      {loaded.status === 'loading' && <LoadingState label="Učitavanje pošiljki…" />}
      {loaded.status === 'error' && <ErrorState title="Pošiljke nisu učitane" message={loaded.message} onRetry={reload} />}
      {loaded.status === 'success' &&
        (loaded.data.rows.length === 0 ? (
          <EmptyState title="Nema unetih pošiljki">
            Pošiljke se unose uvozom Excel fajla: kliknite „Uvezi Excel“, izaberite fajl, povežite kolone,
            ispravite redove sa greškom i potvrdite upis.
          </EmptyState>
        ) : (
          <>
            {saved && <SavedNotice result={saved} />}
            <ShipmentTable
              {...loaded.data}
              onSaved={(result) => {
                setSaved(result)
                reload()
              }}
            />
          </>
        ))}
    </section>
  )
}

function SavedNotice({ result }: { result: ShipmentUpdateResult }) {
  const { tone, title, lines } = describeUpdate(result)
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
  shipments,
  locations,
  onSaved,
}: {
  rows: ShipmentRow[]
  shipments: Shipment[]
  locations: Location[]
  onSaved: (result: ShipmentUpdateResult) => void
}) {
  const totals = shipmentTotals(rows)
  const [editing, setEditing] = useState<number | null>(null)
  const edited = shipments.find((s) => s.id === editing)
  const columns = CAN_EDIT ? 9 : 8
  return (
    <>
      <p className="table-summary text--muted">
        Pošiljki: <strong>{totals.count}</strong> · ukupno <strong>{formatLdm(totals.ldmTenths)} LDM</strong> · sa
        greškom: <strong className={totals.withErrors > 0 ? 'text--error' : undefined}>{totals.withErrors}</strong>
      </p>
      <div className="table-wrap">
        <table className="table" aria-label="Pošiljke">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Preuzimanje</th>
              <th scope="col">Isporuka</th>
              <th scope="col">Poštanski broj</th>
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
              <Fragment key={row.id}>
                <tr aria-current={row.id === editing ? 'true' : undefined}>
                  <td>{row.externalId}</td>
                  <td>{row.pickupName}</td>
                  <td>{row.deliveryName}</td>
                  <td>{row.deliveryPostalCode ?? <span className="text--muted">–</span>}</td>
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
                      <button
                        type="button"
                        className="button--small"
                        onClick={() => setEditing(editing === row.id ? null : row.id)}
                        aria-expanded={editing === row.id}
                        aria-label={`Izmeni pošiljku ${row.externalId}`}
                      >
                        Izmeni
                      </button>
                    </td>
                  )}
                </tr>
                {editing === row.id && edited && (
                  <tr className="table__editor-row">
                    <td colSpan={columns}>
                      <ShipmentEditor
                        shipment={edited}
                        shipments={shipments}
                        locations={locations}
                        onSaved={(result) => {
                          setEditing(null)
                          onSaved(result)
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
