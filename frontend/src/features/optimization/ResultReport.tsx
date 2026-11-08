import { createPortal } from 'react-dom'
import type { OptimizationJob, OptimizationResult } from '../../api/types'
import { formatDateTime } from '../../format/time'
import { formatKg, formatKm, formatLdm, formatUtilization } from '../../format/units'
import {
  buildTruckRows,
  buildUnassignedRows,
  DISTANCE_SOURCES,
  distanceScope,
  type ReferenceData,
  type TruckRow,
} from './resultRows'

/**
 * The results as a report to print or save as PDF (exportPdf): the summary on the first page,
 * then every truck on a page of its own with its stops and shipments. With `truckId`, only that
 * truck's page (the driver's PDF): nothing of the other trucks, the totals or the unassigned
 * shipments, since drivers are not to know what the others carry. Rendered next to the
 * application (a portal into <body>) and shown only in print, where the application is
 * hidden (see .report in layout.css).
 */
export function ResultReport({
  job,
  result,
  reference,
  truckId = null,
}: {
  job: OptimizationJob
  result: OptimizationResult
  reference: ReferenceData
  /** the driver's PDF of this truck; null: the whole result */
  truckId?: number | null
}) {
  const rows = buildTruckRows(result, reference)
  const truck = truckId === null ? null : rows.find((row) => row.truckId === truckId)
  if (truck) {
    return createPortal(
      <article className="report report--truck" data-testid="result-report">
        <header className="report__header">
          <img className="report__logo" src="/logo.png" alt="" width={36} height={36} />
          <div>
            <h1>Ruta i utovar</h1>
            <p className="report__meta">
              Posao #{job.id} · završen {formatDateTime(job.finishedAt)}
            </p>
          </div>
        </header>
        <TruckPage row={truck} jobId={job.id} />
        {result.distanceSource && <p className="report__note">Kilometraže: {DISTANCE_SOURCES[result.distanceSource]}.</p>}
      </article>,
      document.body,
    )
  }

  const unassigned = buildUnassignedRows(result, reference)
  const { passed, violations } = result.validation

  return createPortal(
    <article className="report" data-testid="result-report">
      <header className="report__header">
        <img className="report__logo" src="/logo.png" alt="" width={36} height={36} />
        <div>
          <h1>Rezultat optimizacije</h1>
          <p className="report__meta">
            Posao #{job.id} · završen {formatDateTime(job.finishedAt)} · vremensko ograničenje {job.timeLimitSeconds} s
          </p>
        </div>
      </header>

      <dl className="report__summary">
        <div>
          <dt>Kamioni</dt>
          <dd>
            {result.trucksUsed}
            <span> (donja granica po kapacitetu: {result.trucksLowerBound})</span>
          </dd>
        </div>
        <div>
          <dt>Ukupna kilometraža</dt>
          <dd>
            {formatKm(result.totalMeters)}
            <span> ({distanceScope(result)})</span>
          </dd>
        </div>
        <div>
          <dt>Validator</dt>
          <dd>{passed ? 'prošao, bez grešaka' : `nije prošao, grešaka: ${violations.length}`}</dd>
        </div>
        <div>
          <dt>Nedodeljene pošiljke</dt>
          <dd>{unassigned.length}</dd>
        </div>
      </dl>
      {!passed && (
        <ul className="report__violations">
          {violations.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      )}

      <h2>Kamioni i rute</h2>
      <table className="report__table">
        <thead>
          <tr>
            <th>Kamion</th>
            <th>Vozač</th>
            <th>Pošiljke</th>
            <th className="num">Popunjenost</th>
            <th className="num">Kilometraža</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.truckId}>
              <td>{row.truckName}</td>
              <td>{row.driverName ?? '–'}</td>
              <td>{row.shipmentLabels.join(', ')}</td>
              <td className="num">{fill(row)}</td>
              <td className="num">{formatKm(row.totalMeters)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {unassigned.length > 0 && (
        <>
          <h2>Nedodeljene pošiljke</h2>
          <table className="report__table">
            <thead>
              <tr>
                <th>Pošiljka</th>
                <th className="num">LDM</th>
                <th>Utovar</th>
                <th>Istovar</th>
              </tr>
            </thead>
            <tbody>
              {unassigned.map((row) => (
                <tr key={row.shipmentId}>
                  <td>{row.label}</td>
                  <td className="num">{row.ldmTenths === null ? '–' : formatLdm(row.ldmTenths)}</td>
                  <td>{row.pickupName}</td>
                  <td>{row.deliveryName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {result.distanceSource && <p className="report__note">Kilometraže: {DISTANCE_SOURCES[result.distanceSource]}.</p>}

      {rows.map((row) => (
        <TruckPage key={row.truckId} row={row} jobId={job.id} />
      ))}
    </article>,
    document.body,
  )
}

/** A truck's page, the same in the whole report and in its driver's PDF. */
function TruckPage({ row, jobId }: { row: TruckRow; jobId: number }) {
  const driver = [row.driverName, row.driverPhone].filter(Boolean).join(', ')
  return (
    <section className="report__truck" aria-label={row.truckName}>
      <h2>{row.truckName}</h2>
      <p className="report__meta">
        Posao #{jobId} · {formatKm(row.totalMeters)} · {fill(row)}
      </p>
      {driver && <p className="report__driver">Vozač: {driver}</p>}
      <h3>Stanice redom</h3>
      <Stops row={row} />
      <h3>Pošiljke na kamionu</h3>
      <table className="report__table">
        <thead>
          <tr>
            <th>Pošiljka</th>
            <th>Opis</th>
            <th className="num">LDM</th>
            <th className="num">Težina</th>
            <th>Utovar</th>
            <th>Istovar</th>
          </tr>
        </thead>
        <tbody>
          {row.shipments.map((shipment) => (
            <tr key={shipment.shipmentId}>
              <td>{shipment.label}</td>
              <td>{shipment.description ?? '–'}</td>
              <td className="num">{shipment.ldmTenths === null ? '–' : formatLdm(shipment.ldmTenths)}</td>
              <td className="num">{shipment.weightKg === null ? '–' : `${formatKg(shipment.weightKg)} kg`}</td>
              <td>{shipment.pickupName}</td>
              <td>{shipment.deliveryName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function fill(row: TruckRow): string {
  return row.capacityLdmTenths === null
    ? `${formatLdm(row.usedLdmTenths)} LDM`
    : `${formatLdm(row.usedLdmTenths)} / ${formatLdm(row.capacityLdmTenths)} LDM · ${formatUtilization(row.usedLdmTenths, row.capacityLdmTenths)}`
}

/** The stops in order, as on the results screen (StopList): start or base, stops, return. */
function Stops({ row }: { row: TruckRow }) {
  return (
    <table className="report__table report__stops">
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Vrsta</th>
          <th>Mesto</th>
          <th>Pošiljka</th>
          <th className="num">Od prethodne</th>
          <th className="num">Na kamionu</th>
        </tr>
      </thead>
      <tbody>
        {row.openRoute && row.startName !== null && (
          <tr>
            <td className="num">0</td>
            <td>Polazak</td>
            <td>{row.startName} (lokacija kamiona)</td>
            <td />
            <td />
            <td />
          </tr>
        )}
        {!row.openRoute && (
          <tr>
            <td className="num">0</td>
            <td>Baza</td>
            <td>{row.baseName}</td>
            <td />
            <td />
            <td />
          </tr>
        )}
        {row.stops.map((stop, i) => (
          <tr key={stop.sequence}>
            <td className="num">{stop.sequence}</td>
            <td>{stop.type === 'PICKUP' ? 'Preuzimanje' : 'Isporuka'}</td>
            <td>{stop.locationName}</td>
            <td>{stop.shipmentLabel}</td>
            <td className="num">
              {row.openRoute && row.startName === null && i === 0 ? 'početak rute' : `+${formatKm(stop.legMeters)}`}
            </td>
            <td className="num">{formatLdm(stop.loadAfterLdmTenths)} LDM</td>
          </tr>
        ))}
        {!row.openRoute && (
          <tr>
            <td className="num">↩</td>
            <td>Povratak</td>
            <td>{row.baseName}</td>
            <td />
            <td className="num">+{formatKm(row.returnLegMeters)}</td>
            <td />
          </tr>
        )}
      </tbody>
    </table>
  )
}
