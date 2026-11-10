import { useState } from 'react'
import { flushSync } from 'react-dom'
import type { OptimizationJob, OptimizationResult, Truck } from '../../api/types'
import { Icon } from '../../components/Icon'
import { Notice } from '../../components/Notice'
import { ErrorState, LoadingState } from '../../components/states'
import { formatTime } from '../../format/time'
import { formatKm, formatLdm } from '../../format/units'
import { exportPdf, reportFileName, sendPdfToViber, truckReportFileName } from './exportPdf'
import { ResultReport } from './ResultReport'
import {
  buildTruckRows,
  buildUnassignedRows,
  DISTANCE_SOURCES,
  distanceScope,
  type ReferenceData,
  type TruckRow,
} from './resultRows'
import { RouteTable } from './RouteTable'
import { useLoadPlans } from './useLoadPlans'
import { useReferenceData } from './useReferenceData'
import { ViberPhoneDialog } from './ViberPhoneDialog'
import { AccessPointsNotice } from './AccessPointsNotice'
import { ExtraTruckNotice, ShortageActions } from './FleetActions'
import type { StartOptions } from './lastJobContext'
import { DRIVER_SUPPORTED } from '../trucks/truckFormValidation'

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
  /** the last PDF made: of the whole result (truckId null) or of one truck */
  const [pdf, setPdf] = useState<{ tone: 'success' | 'error'; text: string; truckId: number | null } | null>(null)
  /** the truck whose driver's PDF is being made; null: the report is the whole result */
  const [reportTruckId, setReportTruckId] = useState<number | null>(null)
  const loadPlans = useLoadPlans(
    job.id,
    result.routes.map((route) => route.truckId),
  )

  /** the truck whose driver has no phone, asked for before its PDF goes to Viber */
  const [askPhone, setAskPhone] = useState<{ truck: Truck; row: TruckRow } | null>(null)

  /**
   * Prints the report, of one truck (its driver's part) or of the whole result (truckId null),
   * and says how it went under the button.
   */
  async function printReport(truckId: number | null, print: () => Promise<{ tone: 'success' | 'error'; text: string } | null>) {
    setPdf(null)
    // The drawings of the load need the plans; they are asked for when the result opens.
    await loadPlans.ready()
    // The report must show the right part before it is printed, not on the next render.
    flushSync(() => setReportTruckId(truckId))
    try {
      const message = await print()
      if (message) setPdf({ ...message, truckId })
    } catch (error) {
      setPdf({ tone: 'error', text: `PDF nije napravljen: ${error instanceof Error ? error.message : String(error)}`, truckId })
    } finally {
      setReportTruckId(null)
    }
  }

  /** `truck`: only its part, for its driver; null: the whole result */
  function savePdf(truck: TruckRow | null) {
    void printReport(truck?.truckId ?? null, async () => {
      const outcome = await exportPdf(truck ? truckReportFileName(job.id, truck.truckName) : reportFileName(job.id))
      return outcome.kind === 'saved' ? { tone: 'success', text: `PDF je sačuvan: ${outcome.path}` } : null
    })
  }

  /** The driver's PDF made and the Viber chat with the driver opened; without a number, it is asked for first. */
  function sendToViber(row: TruckRow, phone: string | null = row.driverPhone) {
    if (phone === null) {
      const truck = reference.status === 'success' ? reference.data.trucks.find((t) => t.id === row.truckId) : undefined
      if (truck) setAskPhone({ truck, row })
      else setPdf({ tone: 'error', text: `Kamion ${row.truckName} više ne postoji, pa mu se ne može upisati broj.`, truckId: row.truckId })
      return
    }
    void printReport(row.truckId, async () => {
      const outcome = await sendPdfToViber(truckReportFileName(job.id, row.truckName), phone)
      if (outcome.kind === 'printed') {
        return { tone: 'success', text: `Sačuvajte PDF u prozoru za štampu, pa ga priložite u Viber razgovoru sa ${phone}.` }
      }
      return outcome.viber
        ? {
            tone: 'success',
            text: `PDF je sačuvan: ${outcome.path}. Otvoren je Viber razgovor sa ${phone}: prevucite fajl iz otvorenog foldera u razgovor.`,
          }
        : {
            tone: 'error',
            text: `PDF je sačuvan: ${outcome.path}, ali Viber se nije otvorio. Da li je Viber instaliran na ovom računaru? Fajl možete priložiti i ručno.`,
          }
    })
  }

  const pdfMessage = (truckId: number | null) =>
    pdf &&
    pdf.truckId === truckId && (
      <p role={pdf.tone === 'error' ? 'alert' : 'status'} className={pdf.tone === 'error' ? 'text--error' : 'text--success'}>
        {pdf.text}
      </p>
    )

  return (
    <div className="result">
      <p className="text--muted result__meta">
        Posao #{job.id} · završen {formatTime(job.finishedAt)} · vremensko ograničenje {job.timeLimitSeconds} s
      </p>
      {reference.status === 'success' && (
        <ResultReport job={job} result={result} reference={reference.data} truckId={reportTruckId} loadPlans={loadPlans.plans} />
      )}

      <Summary result={result} onExport={reference.status === 'success' ? () => savePdf(null) : null} />
      {pdfMessage(null)}
      <Validation result={result} />
      {reference.status === 'success' && <AccessPointsNotice result={result} locations={reference.data.locations} />}
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
          {pdf && pdf.truckId !== null && pdfMessage(pdf.truckId)}
          <RouteTable
            jobId={job.id}
            rows={buildTruckRows(result, reference.data)}
            onDriverPdf={savePdf}
            onViber={DRIVER_SUPPORTED ? (row) => sendToViber(row) : undefined}
          />
          {askPhone && (
            <ViberPhoneDialog
              truck={askPhone.truck}
              onSaved={(phone) => {
                const { row } = askPhone
                setAskPhone(null)
                reload()
                sendToViber(row, phone)
              }}
              onClose={() => setAskPhone(null)}
            />
          )}
          <Unassigned result={result} reference={reference.data} />
        </>
      )}
    </div>
  )
}

/** Three cards of the result, then "Izvezi ceo rezultat (PDF)" as a fourth, dark one (once the names are loaded). */
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
            Izvezi ceo rezultat (PDF)
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
