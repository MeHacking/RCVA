import { createPortal } from 'react-dom'
import type { OptimizationJob, OptimizationResult } from '../../api/types'
import { formatDateTime } from '../../format/time'
import { formatKm, formatLdm, formatUtilization } from '../../format/units'
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
 * then every truck on a page of its own with its stops, to hand to its driver. Rendered next
 * to the application (a portal into <body>) and shown only in print, where the application is
 * hidden (see .report in layout.css).
 */
export function ResultReport({
  job,
  result,
  reference,
}: {
  job: OptimizationJob
  result: OptimizationResult
  reference: ReferenceData
}) {
  const rows = buildTruckRows(result, reference)
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
            <th>Pošiljke</th>
            <th className="num">Popunjenost</th>
            <th className="num">Kilometraža</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.truckId}>
              <td>{row.truckName}</td>
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
        <section key={row.truckId} className="report__truck" aria-label={row.truckName}>
          <h2>{row.truckName}</h2>
          <p className="report__meta">
            Posao #{job.id} · {formatKm(row.totalMeters)} · {fill(row)}
          </p>
          <Stops row={row} />
        </section>
      ))}
    </article>,
    document.body,
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
