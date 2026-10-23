import { Link, useSearchParams } from 'react-router'
import type { OptimizationJob, OptimizationResult } from '../../api/types'
import { LdmBar } from '../../components/LdmBar'
import { Notice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatKm } from '../../format/units'
import { completedJob, isLastJobBusy, useLastJob, type LastJobState } from '../optimization/lastJobContext'
import { buildTruckRows, type TruckRow } from '../optimization/resultRows'
import { StopList } from '../optimization/StopList'
import { useReferenceData } from '../optimization/useReferenceData'
import { parseRouteMapParams } from './routeMapParams'

// This phase: routes as stop lists. The geographic map (Leaflet) comes later.

export function RouteMapPage() {
  const { state } = useLastJob()
  const completed = completedJob(state)
  return (
    <section>
      <PageHeader title="Mapa ruta" />
      {completed ? <RouteList job={completed.job} result={completed.result} /> : <NoRoutes state={state} />}
    </section>
  )
}

function NoRoutes({ state }: { state: LastJobState }) {
  if (isLastJobBusy(state)) {
    return <LoadingState label="Optimizacija je u toku; rute se prikazuju kada posao završi." />
  }
  const neverRun = state.kind === 'idle'
  return (
    <EmptyState title="Nema ruta za prikaz">
      {neverRun
        ? 'Rute se prikazuju posle završene optimizacije. '
        : 'Poslednja optimizacija nije dala rute; razlog je na ekranu rezultata. '}
      <Link to="/optimization">{neverRun ? 'Pokrenite optimizaciju' : 'Rezultati optimizacije'}</Link>
    </EmptyState>
  )
}

function RouteList({ job, result }: { job: OptimizationJob; result: OptimizationResult }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [reference, reload] = useReferenceData()
  const { jobId, truckId } = parseRouteMapParams(searchParams)

  if (reference.status === 'loading') return <LoadingState label="Učitavanje ruta…" />
  if (reference.status === 'error') {
    return <ErrorState title="Rute nisu učitane" message={reference.message} onRetry={reload} />
  }

  const rows = buildTruckRows(result, reference.data)
  const selected = truckId === null ? null : (rows.find((row) => row.truckId === truckId) ?? null)
  const visible = selected ? [selected] : rows

  const selectTruck = (id: number | null) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (id === null) next.delete('truck')
      else next.set('truck', String(id))
      return next
    })

  return (
    <>
      <Notice tone="info" title="Prikaz na geografskoj mapi dolazi u kasnijoj fazi">
        <p>Za sada su rute prikazane kao redosled stanica, sa kilometražom po deonici i teretom na kamionu.</p>
      </Notice>

      {jobId !== null && jobId !== job.id && (
        <Notice tone="warning" title={`Posao #${jobId} nije dostupan`} role="status">
          <p>Aplikacija čuva samo poslednji posao; prikazane su rute posla #{job.id}.</p>
        </Notice>
      )}
      {truckId !== null && !selected && (
        <Notice tone="warning" title={`Kamion #${truckId} nema rutu u ovom rezultatu`} role="status">
          <p>Prikazane su sve rute.</p>
        </Notice>
      )}

      <div className="route-filter" role="group" aria-label="Izbor rute">
        <button type="button" aria-pressed={!selected} onClick={() => selectTruck(null)}>
          Sve rute ({rows.length})
        </button>
        {rows.map((row) => (
          <button
            type="button"
            key={row.truckId}
            aria-pressed={selected?.truckId === row.truckId}
            onClick={() => selectTruck(row.truckId)}
          >
            {row.truckName}
          </button>
        ))}
        <span className="route-filter__meta text--muted">
          Posao #{job.id} · ukupno {formatKm(result.totalMeters)}
        </span>
      </div>

      {visible.map((row) => (
        <RouteCard key={row.truckId} jobId={job.id} row={row} />
      ))}
    </>
  )
}

function RouteCard({ jobId, row }: { jobId: number; row: TruckRow }) {
  const headingId = `route-${row.truckId}-title`
  return (
    <article className="panel route-card" aria-labelledby={headingId}>
      <header className="route-card__header">
        <h2 id={headingId}>{row.truckName}</h2>
        <span className="route-card__km">{formatKm(row.totalMeters)}</span>
        <LdmBar usedLdmTenths={row.usedLdmTenths} capacityLdmTenths={row.capacityLdmTenths} />
        <Link className="route-card__link" to={`/truck-3d?job=${jobId}&truck=${row.truckId}`}>
          3D prikaz
        </Link>
      </header>
      <StopList id={`route-${row.truckId}-stops`} row={row} />
    </article>
  )
}
