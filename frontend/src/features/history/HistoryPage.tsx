import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import { PATHS } from '../../app/paths'
import type { JobStatus, JobSummary } from '../../api/types'
import { Badge, type BadgeTone } from '../../components/Badge'
import { Icon } from '../../components/Icon'
import { Notice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatShipmentCount } from '../../format/count'
import { formatClock, formatDateTime } from '../../format/time'
import { formatKm } from '../../format/units'
import { useAsyncData } from '../../hooks/useAsyncData'
import { jobDurationSeconds } from '../optimization/jobClock'
import { JOB_STATUS_LABELS, isTerminal } from '../optimization/jobStatus'
import { isLastJobBusy, useLastJob } from '../optimization/lastJobContext'

const TONES: Record<JobStatus, BadgeTone> = {
  QUEUED: 'info',
  RUNNING: 'info',
  COMPLETED: 'success',
  INFEASIBLE: 'warning',
  CANCELLED: 'neutral',
  FAILED: 'danger',
}

/**
 * Istorija (user, 21.11.2026): the optimizations kept on the device, newest first. "Otvori" shows
 * one on Rezultati (and on Mapa ruta and 3D prikaz, with its PDF), instead of the last one.
 */
export function HistoryPage() {
  const api = useApi()
  const navigate = useNavigate()
  const { state, open, close } = useLastJob()
  const load = useCallback(() => api.listOptimizationJobs(), [api])
  const [jobs, reload] = useAsyncData(load)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const busy = isLastJobBusy(state)
  const shownId = state.kind === 'tracking' ? state.jobId : null

  function show(summary: JobSummary) {
    open(summary.job.id)
    void navigate(PATHS.result)
  }

  async function remove(summary: JobSummary) {
    setDeletingId(summary.job.id)
    try {
      await api.deleteOptimizationJob(summary.job.id)
      close(summary.job.id)
      setConfirmingId(null)
      setMessage({ tone: 'success', text: `Posao #${summary.job.id} je obrisan.` })
      reload()
    } catch (error) {
      setMessage({ tone: 'danger', text: `Posao #${summary.job.id} nije obrisan: ${describeError(error)}` })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section>
      <PageHeader title="Istorija" />
      {jobs.status === 'loading' && <LoadingState label="Učitavanje istorije…" />}
      {jobs.status === 'error' && <ErrorState title="Istorija nije učitana" message={jobs.message} onRetry={reload} />}
      {jobs.status === 'success' && jobs.data === null && (
        <EmptyState title="Istorija nije dostupna">Istoriju optimizacija čuva samo aplikacija na uređaju.</EmptyState>
      )}
      {jobs.status === 'success' && jobs.data?.length === 0 && (
        <EmptyState title="Još nema optimizacija">
          Svaka pokrenuta optimizacija se ovde čuva sa rezultatom, pa joj se možete vratiti kasnije.
        </EmptyState>
      )}
      {message && (
        <Notice tone={message.tone} title={message.text} role="status" />
      )}
      {jobs.status === 'success' && jobs.data && jobs.data.length > 0 && (
        <section className="panel truck-card" aria-labelledby="history-title">
          <h2 id="history-title">Sačuvane optimizacije</h2>
          <p className="text--muted">
            Uređaj čuva poslednjih 50 optimizacija sa rezultatima. „Otvori“ prikazuje rezultat na ekranu Rezultati, a
            onda i na mapi ruta i u 3D prikazu, sa PDF-om za vozače.
            {busy && ' Dok optimizacija radi, drugi rezultat se ne može otvoriti.'}
          </p>
          <div className="table-wrap">
            <table className="table history-table" aria-label="Sačuvane optimizacije">
              <thead>
                <tr>
                  <th scope="col">Posao</th>
                  <th scope="col">Pokrenut</th>
                  <th scope="col">Status</th>
                  <th scope="col">Kamioni</th>
                  <th scope="col" className="num">
                    Kilometraža
                  </th>
                  <th scope="col">Pošiljke</th>
                  <th scope="col" className="num">
                    Trajanje
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Akcije</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.data.map((summary) => {
                  const { job } = summary
                  const duration = jobDurationSeconds(job)
                  return (
                    <tr key={job.id} aria-current={job.id === shownId ? 'true' : undefined}>
                      <td>
                        #{job.id}
                        {job.id === shownId && <span className="history-table__shown">prikazan</span>}
                      </td>
                      <td>{formatDateTime(job.createdAt)}</td>
                      <td>
                        <Badge tone={TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
                        {summary.manual && <span className="history-table__note">ručno izmenjen</span>}
                      </td>
                      <td>
                        {summary.trucksUsed === null ? (
                          <span className="text--muted">–</span>
                        ) : (
                          <span className="history-table__trucks">
                            <strong>{summary.trucksUsed}</strong>
                            <span className="text--muted">{summary.truckNames.join(', ')}</span>
                          </span>
                        )}
                      </td>
                      <td className="num">{summary.totalMeters === null ? '–' : formatKm(summary.totalMeters)}</td>
                      <td>
                        {formatShipmentCount(summary.shipmentCount)}
                        {summary.unassignedCount ? (
                          <span className="history-table__note">nedodeljeno: {summary.unassignedCount}</span>
                        ) : null}
                      </td>
                      <td className="num">
                        {duration === null ? '–' : formatClock(duration)}
                        <span className="history-table__note">od {formatClock(job.timeLimitSeconds)}</span>
                      </td>
                      <td className="actions">
                        {confirmingId === job.id ? (
                          <span className="confirm-inline" role="group" aria-label={`Potvrda brisanja: posao #${job.id}`}>
                            <span>Obrisati posao?</span>
                            <button
                              type="button"
                              className="button--danger"
                              onClick={() => void remove(summary)}
                              disabled={deletingId === job.id}
                            >
                              {deletingId === job.id ? 'Brisanje…' : 'Da, obriši'}
                            </button>
                            <button type="button" onClick={() => setConfirmingId(null)} disabled={deletingId === job.id}>
                              Otkaži
                            </button>
                          </span>
                        ) : (
                          <span className="confirm-inline">
                            <button
                              type="button"
                              className="button--primary"
                              onClick={() => show(summary)}
                              disabled={busy || !isTerminal(job.status)}
                              aria-label={`Otvori posao #${job.id}`}
                            >
                              <Icon name="results" size={14} />
                              Otvori
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMessage(null)
                                setConfirmingId(job.id)
                              }}
                              disabled={!isTerminal(job.status)}
                              aria-label={`Obriši posao #${job.id}`}
                            >
                              <Icon name="trash" size={14} />
                              Obriši
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  )
}
