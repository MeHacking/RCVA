import { useSearchParams } from 'react-router'
import type { OptimizationJob, OptimizationResult } from '../../api/types'
import { formatKm } from '../../format/units'
import { routeColor } from '../route-map/mapModel'
import type { TruckRow } from './resultRows'

export function RouteSwatch({ color }: { color: number }) {
  return <span className="route-swatch" style={{ background: `var(--route-${color})` }} aria-hidden="true" />
}

/**
 * All trucks or one (user, 21.11.2026: the result offers all trucks, and a filter focuses on one).
 * The choice is `?truck=` in the address, so it stays when the result's view changes (Rute, Mapa,
 * 3D prikaz). `selected`: the chosen truck's row, null for all.
 */
export function RouteFilter({
  job,
  result,
  rows,
  selected,
}: {
  job: OptimizationJob
  result: OptimizationResult
  rows: TruckRow[]
  selected: TruckRow | null
}) {
  const [, setSearchParams] = useSearchParams()
  const selectTruck = (id: number | null) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (id === null) next.delete('truck')
      else next.set('truck', String(id))
      return next
    })
  return (
    <div className="route-filter" role="group" aria-label="Izbor rute">
      <button type="button" aria-pressed={!selected} onClick={() => selectTruck(null)}>
        Sve rute ({rows.length})
      </button>
      {rows.map((row) => (
        <button type="button" key={row.truckId} aria-pressed={selected?.truckId === row.truckId} onClick={() => selectTruck(row.truckId)}>
          <RouteSwatch color={routeColor(result, row.truckId)} />
          {row.truckName}
        </button>
      ))}
      <span className="route-filter__meta text--muted">
        Posao #{job.id} · ukupno {formatKm(result.totalMeters)}
      </span>
    </div>
  )
}
