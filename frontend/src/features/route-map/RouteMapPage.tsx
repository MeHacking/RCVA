import { lazy, Suspense } from 'react'
import { Link, useSearchParams } from 'react-router'
import { apiMode } from '../../api/apiMode'
import { ORS_ATTRIBUTION } from '../../api/local/openRouteService'
import type { OptimizationJob, OptimizationResult, OrsProfile } from '../../api/types'
import { LdmBar } from '../../components/LdmBar'
import { Notice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatKm } from '../../format/units'
import { completedJob, isLastJobBusy, useLastJob, type LastJobState } from '../optimization/lastJobContext'
import { buildTruckRows, routesVersion, type TruckRow } from '../optimization/resultRows'
import { StopList } from '../optimization/StopList'
import { useReferenceData } from '../optimization/useReferenceData'
import { buildMapModel, routeColor, type LatLng, type MapRoute } from './mapModel'
import { parseRouteMapParams } from './routeMapParams'
import { useRouteLines, type RouteLineState } from './useRouteLines'

// The routes on a map, then as stop lists. A route is drawn along the roads when the API
// gives its road line (the application on the device with an ORS key), otherwise as a
// dashed straight line from stop to stop, and the caption says which. Leaflet is loaded
// only when this screen shows a result.
const RouteMap = lazy(() => import('./RouteMap'))

const ROADS_FOR: Record<OrsProfile, string> = { 'driving-hgv': 'za teretna vozila', 'driving-car': 'za automobile' }

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
  const shownTrucks = truckId !== null && result.routes.some((r) => r.truckId === truckId) ? [truckId] : result.routes.map((r) => r.truckId)
  const [lines, retryLines] = useRouteLines(job.id, shownTrucks, routesVersion(result))

  if (reference.status === 'loading') return <LoadingState label="Učitavanje ruta…" />
  if (reference.status === 'error') {
    return <ErrorState title="Rute nisu učitane" message={reference.message} onRetry={reload} />
  }

  const rows = buildTruckRows(result, reference.data)
  const selected = truckId === null ? null : (rows.find((row) => row.truckId === truckId) ?? null)
  const visible = selected ? [selected] : rows
  const roads = new Map<number, LatLng[]>()
  for (const [id, line] of lines) if (line.status === 'road') roads.set(id, line.line.path)
  const model = buildMapModel(result, reference.data, visible.map((row) => row.truckId), roads)
  const failed = [...lines.values()].flatMap((line) => (line.status === 'error' ? [line.message] : []))

  const selectTruck = (id: number | null) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (id === null) next.delete('truck')
      else next.set('truck', String(id))
      return next
    })

  return (
    <>
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
            <RouteSwatch color={routeColor(result, row.truckId)} />
            {row.truckName}
          </button>
        ))}
        <span className="route-filter__meta text--muted">
          Posao #{job.id} · ukupno {formatKm(result.totalMeters)}
        </span>
      </div>

      <figure className="panel route-map-panel">
        <Suspense fallback={<LoadingState label="Učitavanje mape…" />}>
          <RouteMap model={model} />
        </Suspense>
        <MapCaption routes={model.routes} lines={lines} openRoute={result.openRoute === true} />
      </figure>
      {failed.length > 0 && (
        <Notice tone="warning" title={`Linije po putu nisu dostupne (${failed.length})`} role="status">
          <p>{[...new Set(failed)].join(' ')} Te rute su nacrtane pravom linijom.</p>
          <button type="button" onClick={retryLines}>
            Pokušaj ponovo
          </button>
        </Notice>
      )}
      {model.missing.length > 0 && (
        <Notice tone="warning" title={`Mesta bez koordinata nisu na mapi (${model.missing.length})`} role="status">
          <p>{model.missing.join(', ')}</p>
        </Notice>
      )}

      {visible.map((row) => (
        <RouteCard key={row.truckId} jobId={job.id} row={row} color={routeColor(result, row.truckId)} />
      ))}
    </>
  )
}

function MapCaption({ routes, lines, openRoute }: { routes: MapRoute[]; lines: Map<number, RouteLineState>; openRoute: boolean }) {
  const states = routes.filter((r) => r.path.length >= 2).map((r) => lines.get(r.truckId) ?? { status: 'loading' as const })
  const road = states.flatMap((s) => (s.status === 'road' ? [s.line.profile] : []))
  const loading = states.filter((s) => s.status === 'loading').length
  const none = states.some((s) => s.status === 'none')
  const roadsFor = [...new Set(road)].map((profile) => ROADS_FOR[profile]).join(' i ')
  let lineText: string
  if (road.length > 0 && road.length === states.length) lineText = `Linije prate put ${roadsFor} redom obilaska (${ORS_ATTRIBUTION}).`
  else if (road.length > 0) {
    lineText = `Pune linije prate put ${roadsFor} (${ORS_ATTRIBUTION}); isprekidane spajaju stanice pravom linijom, ne po putu.`
  } else lineText = 'Isprekidane linije spajaju stanice redom obilaska pravom linijom, ne po putu.'
  return (
    <figcaption className="text--muted route-map-panel__caption" data-testid="map-caption">
      {lineText}
      {loading > 0 && ` Linije po putu se učitavaju (još ${loading}).`}
      {none &&
        (apiMode() === 'local' ? (
          <>
            {' '}
            Za linije po putu unesite ključ za OpenRouteService u <Link to="/settings">Podešavanjima</Link>.
          </>
        ) : (
          ' U ovom režimu nema podataka o putevima.'
        ))}{' '}
      Kilometraža je u spisku stanica. Puna tačka je preuzimanje, prazna isporuka{openRoute ? '' : ', tamna baza'}.
    </figcaption>
  )
}

function RouteSwatch({ color }: { color: number }) {
  return <span className="route-swatch" style={{ background: `var(--route-${color})` }} aria-hidden="true" />
}

function RouteCard({ jobId, row, color }: { jobId: number; row: TruckRow; color: number }) {
  const headingId = `route-${row.truckId}-title`
  return (
    <article className="panel route-card" aria-labelledby={headingId}>
      <header className="route-card__header">
        <h2 id={headingId}>
          <RouteSwatch color={color} />
          {row.truckName}
        </h2>
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
