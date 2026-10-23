import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useApi } from '../../api/apiContext'
import { Badge, type BadgeTone } from '../../components/Badge'
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
import { shipmentsCsvFileName, shipmentsToCsv } from './shipmentsCsv'

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
    return buildShipmentRows(shipments, locations)
  }, [api])
  const [rows, reload] = useAsyncData(load)

  const exportCsv = () => {
    if (rows.status !== 'success') return
    downloadText(shipmentsCsvFileName(new Date()), CSV_BOM + shipmentsToCsv(rows.data), 'text/csv;charset=utf-8')
  }

  return (
    <section>
      <PageHeader
        title="Pošiljke"
        actions={
          <>
            <button type="button" onClick={exportCsv} disabled={rows.status !== 'success' || rows.data.length === 0}>
              Izvezi CSV
            </button>
            <button type="button" className="button--primary" onClick={() => navigate('/shipments/import')}>
              Uvezi Excel
            </button>
          </>
        }
      />

      {rows.status === 'loading' && <LoadingState label="Učitavanje pošiljki…" />}
      {rows.status === 'error' && <ErrorState title="Pošiljke nisu učitane" message={rows.message} onRetry={reload} />}
      {rows.status === 'success' &&
        (rows.data.length === 0 ? (
          <EmptyState title="Nema unetih pošiljki">
            Pošiljke se unose uvozom Excel fajla: kliknite „Uvezi Excel“, izaberite fajl, povežite kolone,
            ispravite redove sa greškom i potvrdite upis.
          </EmptyState>
        ) : (
          <ShipmentTable rows={rows.data} />
        ))}
    </section>
  )
}

function ShipmentTable({ rows }: { rows: ShipmentRow[] }) {
  const totals = shipmentTotals(rows)
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
              <th scope="col" className="num" title="Informativno; nije ograničenje u optimizaciji">
                Težina (kg)
              </th>
              <th scope="col">Dimenzije (D × Š × V)</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
