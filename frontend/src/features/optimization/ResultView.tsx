import type { OptimizationJob, OptimizationResult } from '../../api/types'
import { Notice } from '../../components/Notice'
import { ErrorState, LoadingState } from '../../components/states'
import { formatTime } from '../../format/time'
import { formatKm, formatLdm, formatScore } from '../../format/units'
import { buildTruckRows, buildUnassignedRows, type ReferenceData } from './resultRows'
import { RouteTable } from './RouteTable'
import { useReferenceData } from './useReferenceData'

export function ResultView({ job, result }: { job: OptimizationJob; result: OptimizationResult }) {
  const [reference, reload] = useReferenceData()

  return (
    <div className="result">
      <p className="text--muted result__meta">
        Posao #{job.id} · završen {formatTime(job.finishedAt)} · vremensko ograničenje {job.timeLimitSeconds} s
      </p>

      <Summary job={job} result={result} />
      <Validation result={result} />

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

function Summary({ job, result }: { job: OptimizationJob; result: OptimizationResult }) {
  const atLowerBound = result.trucksUsed === result.trucksLowerBound
  const score =
    job.scoreHard !== null && job.scoreMedium !== null && job.scoreSoft !== null
      ? formatScore(job.scoreHard, job.scoreMedium, job.scoreSoft)
      : '–'
  return (
    <dl className="stats">
      <div className="stat">
        <dt>Kamioni</dt>
        <dd className="stat__value">{result.trucksUsed}</dd>
        <dd className="stat__hint">
          {atLowerBound
            ? 'jednako donjoj granici po kapacitetu'
            : `donja granica po kapacitetu: ${result.trucksLowerBound}`}
        </dd>
      </div>
      <div className="stat">
        <dt>Ukupna kilometraža</dt>
        <dd className="stat__value">{formatKm(result.totalMeters)}</dd>
        <dd className="stat__hint">
          {result.openRoute ? 'od prvog utovara do poslednjeg istovara' : 'uključuje povratak u bazu'}
        </dd>
      </div>
      <div className="stat">
        <dt>Skor (Hard/Medium/Soft)</dt>
        <dd className="stat__value stat__value--mono">{score}</dd>
        <dd className="stat__hint">medium = −kamioni, soft = −metri</dd>
      </div>
      <div className="stat">
        <dt>Validator</dt>
        <dd className={`stat__value ${result.validation.passed ? 'text--success' : 'text--error'}`}>
          {result.validation.passed ? 'Prošao' : 'Nije prošao'}
        </dd>
        <dd className="stat__hint">
          {result.validation.passed ? 'bez grešaka' : `grešaka: ${result.validation.violations.length}`}
        </dd>
      </div>
    </dl>
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
