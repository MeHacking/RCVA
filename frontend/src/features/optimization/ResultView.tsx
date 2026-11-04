import { useState } from 'react'
import type { OptimizationJob, OptimizationResult } from '../../api/types'
import { Icon } from '../../components/Icon'
import { Notice } from '../../components/Notice'
import { ErrorState, LoadingState } from '../../components/states'
import { formatTime } from '../../format/time'
import { formatKm, formatLdm } from '../../format/units'
import { exportPdf, reportFileName } from './exportPdf'
import { ResultReport } from './ResultReport'
import { buildTruckRows, buildUnassignedRows, DISTANCE_SOURCES, distanceScope, type ReferenceData } from './resultRows'
import { RouteTable } from './RouteTable'
import { useReferenceData } from './useReferenceData'
import { ExtraTruckNotice, ShortageActions } from './FleetActions'
import type { StartOptions } from './lastJobContext'

/** `options`: how the job was started, on the device; there the result offers trucks to add. */
export function ResultView({
  job,
  result,
  options = null,
}: {
  job: OptimizationJob
  result: OptimizationResult
  options?: StartOptions | null
}) {
  const [reference, reload] = useReferenceData()
  const [pdf, setPdf] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function savePdf() {
    setPdf(null)
    try {
      const outcome = await exportPdf(reportFileName(job.id))
      if (outcome.kind === 'saved') setPdf({ tone: 'success', text: `PDF je sačuvan: ${outcome.path}` })
    } catch (error) {
      setPdf({ tone: 'error', text: `PDF nije napravljen: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  return (
    <div className="result">
      <p className="text--muted result__meta">
        Posao #{job.id} · završen {formatTime(job.finishedAt)} · vremensko ograničenje {job.timeLimitSeconds} s
      </p>
      {reference.status === 'success' && <ResultReport job={job} result={result} reference={reference.data} />}

      <Summary result={result} onExport={reference.status === 'success' ? () => void savePdf() : null} />
      {pdf && (
        <p role={pdf.tone === 'error' ? 'alert' : 'status'} className={pdf.tone === 'error' ? 'text--error' : 'text--success'}>
          {pdf.text}
        </p>
      )}
      <Validation result={result} />
      {options && <ExtraTruckNotice result={result} options={options} />}
      {options && result.unassignedShipmentIds.length > 0 && (
        <Notice tone="warning" title={`Nema dovoljno kamiona: nedodeljenih pošiljki ${result.unassignedShipmentIds.length}`} role="status">
          <p>Kamioni nisu mogli da ponesu sve pošiljke; nedodeljene su navedene ispod ruta.</p>
          <ShortageActions add={1} options={options} />
        </Notice>
      )}

      {reference.status === 'loading' && <LoadingState label="Učitavanje kamiona i pošiljki…" />}
      {reference.status === 'error' && (
        <ErrorState title="Detalji rezultata nisu učitani" message={reference.message} onRetry={reload} />
      )}
      {reference.status === 'success' && (
        <>
          <h2 className="section-title">Kamioni i rute</h2>
          <RouteTable jobId={job.id} rows={buildTruckRows(result, reference.data)} />
          <Unassigned result={result} reference={reference.data} />
        </>
      )}
    </div>
  )
}

/** Three cards of the result, then "Izvezi PDF" as a fourth, dark one (once the names are loaded). */
function Summary({ result, onExport }: { result: OptimizationResult; onExport: (() => void) | null }) {
  const atLowerBound = result.trucksUsed === result.trucksLowerBound
  return (
    <div className="stats">
      <dl className="stat">
        <dt>Kamioni</dt>
        <dd className="stat__value">{result.trucksUsed}</dd>
        <dd className="stat__hint">
          {atLowerBound
            ? 'jednako donjoj granici po kapacitetu'
            : `donja granica po kapacitetu: ${result.trucksLowerBound}`}
        </dd>
      </dl>
      <dl className="stat">
        <dt>Ukupna kilometraža</dt>
        <dd className="stat__value">{formatKm(result.totalMeters)}</dd>
        <dd className="stat__hint">{distanceScope(result)}</dd>
        {result.distanceSource && (
          <dd className="stat__hint" data-testid="distance-source">
            {DISTANCE_SOURCES[result.distanceSource]}
          </dd>
        )}
      </dl>
      <dl className="stat">
        <dt>Validator</dt>
        <dd className={`stat__value ${result.validation.passed ? 'text--success' : 'text--error'}`}>
          {result.validation.passed ? 'Prošao' : 'Nije prošao'}
        </dd>
        <dd className="stat__hint">
          {result.validation.passed ? 'bez grešaka' : `grešaka: ${result.validation.violations.length}`}
        </dd>
      </dl>
      {onExport && (
        <button type="button" className="stat stat-action" onClick={onExport}>
          <span className="stat-action__title">
            <Icon name="download" size={22} />
            Izvezi PDF
          </span>
          <span className="stat-action__hint">rezime i strana po kamionu</span>
        </button>
      )}
    </div>
  )
}

function Validation({ result }: { result: OptimizationResult }) {
  const { passed, violations } = result.validation
  if (passed) {
    return (
      <Notice tone="success" title="Validator: rešenje je prošlo nezavisnu proveru">
        <p>Kapacitet, dodela svake pošiljke, redosled preuzimanja i isporuka i kilometraža ponovo su provereni van solvera.</p>
      </Notice>
    )
  }
  return (
    <Notice tone="danger" title="Validator: rešenje nije prošlo proveru" role="alert">
      <p>Neslaganje validatora i solvera je greška sistema, ne unetih podataka.</p>
      <ul className="notice__list">
        {violations.map((violation) => (
          <li key={violation}>{violation}</li>
        ))}
      </ul>
    </Notice>
  )
}

function Unassigned({ result, reference }: { result: OptimizationResult; reference: ReferenceData }) {
  const rows = buildUnassignedRows(result, reference)
  return (
    <>
      <h2 className="section-title">Nedodeljene pošiljke</h2>
      {rows.length === 0 ? (
        <p className="text--muted">Sve pošiljke su dodeljene kamionima.</p>
      ) : (
        <div className="table-wrap">
          <table className="table" aria-label="Nedodeljene pošiljke">
            <thead>
              <tr>
                <th scope="col">Pošiljka</th>
                <th scope="col" className="num">
                  LDM
                </th>
                <th scope="col">Preuzimanje</th>
                <th scope="col">Isporuka</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.shipmentId}>
                  <td>{row.label}</td>
                  <td className="num">{row.ldmTenths === null ? '–' : formatLdm(row.ldmTenths)}</td>
                  <td>{row.pickupName}</td>
                  <td>{row.deliveryName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
