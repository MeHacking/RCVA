import { Eye } from 'lucide-react'
import { defaultJobName } from '../../format/jobName'
import { NameDialog } from '../optimization/NameDialog'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import { PATHS } from '../../app/paths'
import type { JobStatus, JobSummary } from '../../api/types'
import { Badge, type BadgeTone } from '../../components/Badge'
import { Icon } from '../../components/Icon'
import { PencilIcon, TrashIcon } from '../../components/MotionIcons'
import { Notice } from '../../components/Notice'
import { matchesQuery } from '../../app/search'
import { PageHeader } from '../../components/PageHeader'
import { SearchBox } from '../../components/SearchBox'
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

/** A saved job for the search: its name, when it started, its state, trucks and kilometres. */
function matchesJob(summary: JobSummary, query: string): boolean {
  const { job } = summary
  return matchesQuery(query, [
    summary.name,
    formatDateTime(job.createdAt),
    JOB_STATUS_LABELS[job.status],
    ...summary.truckNames,
    summary.totalMeters === null ? null : formatKm(summary.totalMeters),
    formatShipmentCount(summary.shipmentCount),
  ])
}

/**
 * Istorija (user, 21.11.2026): the optimizations saved on the device ("Sačuvaj" at the end of the
 * result, 22.11.2026), newest first, by their names (no numbers). "Otvori" shows one on Rezultati
 * (and on Mapa ruta and 3D prikaz, with its PDF), instead of the last one; "Preimenuj" names it.
 */
export function HistoryPage() {
  const api = useApi()
  const navigate = useNavigate()
  const { state, open, close, updateJob } = useLastJob()
  const [renaming, setRenaming] = useState<JobSummary | null>(null)
  const load = useCallback(() => api.listOptimizationJobs(), [api])
  const [jobs, reload] = useAsyncData(load)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  // The search in the top bar (as in smartLoad+'s Istorija).
  const [query, setQuery] = useState('')
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
      setMessage({ tone: 'success', text: `„${summary.name}“ je obrisana.` })
      reload()
    } catch (error) {
      setMessage({ tone: 'danger', text: `„${summary.name}“ nije obrisana: ${describeError(error)}` })
    } finally {
      setDeletingId(null)
    }
  }

  async function rename(summary: JobSummary, name: string | null) {
    setRenaming(null)
    if (name === null) return
    try {
      const job = await api.saveOptimizationJob(summary.job.id, name || null)
      updateJob(job)
      reload()
    } catch (error) {
      setMessage({ tone: 'danger', text: `Ime nije promenjeno: ${describeError(error)}` })
    }
  }

  return (
    <section>
      <PageHeader
        title="Istorija"
        tools={<SearchBox value={query} onChange={setQuery} placeholder="Pretraži: naziv, datum, kamion…" label="Pretraga istorije" />}
      />
      {jobs.status === 'loading' && <LoadingState label="Učitavanje istorije…" />}
      {jobs.status === 'error' && <ErrorState title="Istorija nije učitana" message={jobs.message} onRetry={reload} />}
      {jobs.status === 'success' && jobs.data === null && (
        <EmptyState title="Istorija nije dostupna">Istoriju optimizacija čuva samo aplikacija na uređaju.</EmptyState>
      )}
      {jobs.status === 'success' && jobs.data?.length === 0 && (
        <EmptyState title="Još nema sačuvanih optimizacija">
          Optimizacija se ovde čuva dugmetom „Sačuvaj“ na kraju rezultata, pa joj se možete vratiti kasnije.
        </EmptyState>
      )}
      {message && (
        <Notice tone={message.tone} title={message.text} role="status" />
      )}
      {jobs.status === 'success' && jobs.data && jobs.data.length > 0 && (
        <section className="panel truck-card" aria-labelledby="history-title">
          <h2 id="history-title">Sačuvane optimizacije</h2>
          <p className="text--muted">
            Optimizacije sačuvane dugmetom „Sačuvaj“ na kraju rezultata (najviše 50). „Otvori“ prikazuje rezultat na
            ekranu Rezultati, a onda i na mapi ruta i u 3D prikazu, sa PDF-om za vozače.
            {busy && ' Dok optimizacija radi, drugi rezultat se ne može otvoriti.'}
          </p>
          {query.trim() && !jobs.data.some((summary) => matchesJob(summary, query)) && (
            <p className="text--muted">Nijedna optimizacija ne odgovara pretrazi „{query.trim()}“.</p>
          )}
          <div className="table-wrap">
            <table className="table history-table" aria-label="Sačuvane optimizacije">
              <thead>
                <tr>
                  {/* The eye's column, without a title (owner, 22.11.2026). */}
                  <th scope="col" className="history-table__eye">
                    <span className="visually-hidden">Prikazana</span>
                  </th>
                  <th scope="col">Naziv</th>
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
                {jobs.data.filter((summary) => matchesJob(summary, query)).map((summary) => {
                  const { job } = summary
                  const duration = jobDurationSeconds(job)
                  return (
                    <tr key={job.id} aria-current={job.id === shownId ? 'true' : undefined}>
                      {/* As in smartLoad+ (owner, 22.11.2026): an eye on the one shown, in a column of its own. */}
                      <td className="history-table__eye">
                        {job.id === shownId && (
                          <>
                            <Eye aria-hidden="true" size={18} />
                            <span className="visually-hidden">prikazana</span>
                          </>
                        )}
                      </td>
                      <td>
                        {summary.name}
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
                          // Only how many (owner, 21.11.2026): the names did not fit.
                          summary.trucksUsed
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
                          <span className="confirm-inline" role="group" aria-label={`Potvrda brisanja: ${summary.name}`}>
                            <span>Obrisati optimizaciju?</span>
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
                              aria-label={`Otvori: ${summary.name}`}
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
                              aria-label={`Obriši: ${summary.name}`}
                              title="Obriši"
                              className="button--icon button--delete"
                            >
                              <TrashIcon />
                            </button>
                            {/* Icons only, so the row fits; the names are for screen readers and the tooltip. */}
                            <button
                              type="button"
                              onClick={() => setRenaming(summary)}
                              aria-label={`Preimenuj: ${summary.name}`}
                              title="Preimenuj"
                              className="button--icon"
                            >
                              <PencilIcon />
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
      {renaming && (
        <NameDialog
          title="Novo ime"
          text="Ime pod kojim se optimizacija vidi u istoriji."
          name={renaming.name}
          usualName={defaultJobName(
            renaming.trucksUsed === null || renaming.totalMeters === null
              ? null
              : { trucksUsed: renaming.trucksUsed, totalMeters: renaming.totalMeters },
          )}
          onDone={(name) => void rename(renaming, name)}
        />
      )}
    </section>
  )
}
