import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useApi } from '../../api/apiContext'
import type { OptimizationJob, OptimizationResult, RoutePlan, Truck } from '../../api/types'
import { Icon } from '../../components/Icon'
import { LdmBar } from '../../components/LdmBar'
import { Notice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatDimensionsMm, formatKg, formatLdm } from '../../format/units'
import { useAsyncData } from '../../hooks/useAsyncData'
import { completedJob, isLastJobBusy, useLastJob } from '../optimization/lastJobContext'
import { buildTruckRows, type ReferenceData } from '../optimization/resultRows'
import { useReferenceData } from '../optimization/useReferenceData'
import { parseRouteMapParams } from '../route-map/routeMapParams'
import { placementColor } from './tego/tegoAdapter'
import { TruckVisualizer } from './TruckVisualizer'

export function Truck3dPage() {
  const { state } = useLastJob()
  const completed = completedJob(state)
  return (
    <section>
      <PageHeader title="3D prikaz kamiona" />
      {completed ? (
        <LoadPlans job={completed.job} result={completed.result} />
      ) : isLastJobBusy(state) ? (
        <LoadingState label="Optimizacija je u toku; raspored se prikazuje kada posao završi." />
      ) : (
        <EmptyState title="Nema rasporeda za prikaz">
          3D raspored se pravi za kamione iz završene optimizacije.{' '}
          <Link to="/optimization">{state.kind === 'idle' ? 'Pokrenite optimizaciju' : 'Rezultati optimizacije'}</Link>
        </EmptyState>
      )}
    </section>
  )
}

function LoadPlans({ job, result }: { job: OptimizationJob; result: OptimizationResult }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [reference, reload] = useReferenceData()
  const { truckId } = parseRouteMapParams(searchParams)

  if (reference.status === 'loading') return <LoadingState label="Učitavanje kamiona…" />
  if (reference.status === 'error') {
    return <ErrorState title="Kamioni nisu učitani" message={reference.message} onRetry={reload} />
  }

  const rows = buildTruckRows(result, reference.data)
  const selected = rows.find((row) => row.truckId === truckId) ?? rows[0]
  if (!selected) return <EmptyState title="Rezultat nema nijednu rutu" />
  const truck = reference.data.trucks.find((t) => t.id === selected.truckId)

  const selectTruck = (id: number) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('truck', String(id))
      return next
    })

  return (
    <>
      <div className="route-filter" role="group" aria-label="Izbor kamiona">
        {rows.map((row) => (
          <button
            type="button"
            key={row.truckId}
            aria-pressed={row.truckId === selected.truckId}
            onClick={() => selectTruck(row.truckId)}
          >
            {row.truckName}
          </button>
        ))}
        <span className="route-filter__meta text--muted">Posao #{job.id}</span>
      </div>
      {truck ? (
        <TruckLoad
          key={truck.id}
          jobId={job.id}
          truck={truck}
          route={result.routes.find((r) => r.truckId === truck.id)}
          reference={reference.data}
        />
      ) : (
        <ErrorState title="Kamion ne postoji" message={`Kamion #${selected.truckId} nije među kamionima.`} />
      )}
    </>
  )
}

/** One truck's load plan; remounted per truck, so the selection resets with it. */
function TruckLoad({
  jobId,
  truck,
  route,
  reference,
}: {
  jobId: number
  truck: Truck
  /** the truck's route in the result: its fill and the order of the deliveries */
  route: RoutePlan | undefined
  reference: ReferenceData
}) {
  const api = useApi()
  const load = useCallback(() => api.getLoadPlan(jobId, truck.id), [api, jobId, truck.id])
  const [plan, reload] = useAsyncData(load)
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null)

  if (plan.status === 'loading') return <LoadingState label="Učitavanje rasporeda…" />
  if (plan.status === 'error') return <ErrorState title="Raspored nije učitan" message={plan.message} onRetry={reload} />

  const { placements, mode, warnings } = plan.data
  const { innerLengthMm, innerWidthMm, innerHeightMm } = truck
  if (innerLengthMm === null || innerWidthMm === null || innerHeightMm === null) {
    return <ErrorState title="Nedostaju dimenzije kamiona" message="Unesite dimenzije tovarnog prostora na ekranu Kamioni." />
  }
  const shipments = new Map(reference.shipments.map((s) => [s.id, s]))
  const locations = new Map(reference.locations.map((l) => [l.id, l.name]))
  const toggle = (id: number) => setSelectedShipmentId((current) => (current === id ? null : id))
  // 1 = the first shipment off the truck (it stands at the doors: loading is from the rear).
  const deliveryOrder = new Map(
    (route?.stops ?? []).filter((s) => s.type === 'DELIVERY').map((s, i) => [s.shipmentId, i + 1] as const),
  )

  return (
    <>
      {warnings.length > 0 && (
        <Notice tone="warning" title="Upozorenja rasporeda">
          <ul className="notice__list">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}
      <div className="truck-3d">
        <TruckVisualizer
          truck={{ innerLengthMm, innerWidthMm, innerHeightMm }}
          placements={placements}
          mode={mode}
          selectedShipmentId={selectedShipmentId}
          onSelect={(id) => id !== null && toggle(id)}
        />
        <section className="panel truck-3d__list" aria-labelledby="truck-3d-shipments">
          <h2 id="truck-3d-shipments">
            {truck.name}: {placements.length} pošiljke
          </h2>
          {route && <LdmBar usedLdmTenths={route.usedLdmTenths} capacityLdmTenths={truck.capacityLdmTenths} />}
          <p className="truck-3d__space">
            <span className="text--muted">Tovarni prostor (D × Š × V)</span>
            <span className="truck-3d__chip">{formatDimensionsMm(innerLengthMm, innerWidthMm, innerHeightMm)}</span>
          </p>
          <ul className="truck-3d__shipments">
            {placements.map((p, index) => {
              const shipment = shipments.get(p.shipmentId)
              const unloaded = deliveryOrder.get(p.shipmentId)
              return (
                <li key={p.shipmentId}>
                  <button
                    type="button"
                    className="truck-3d__shipment"
                    aria-pressed={selectedShipmentId === p.shipmentId}
                    onClick={() => toggle(p.shipmentId)}
                  >
                    {/* The same colour as the shipment's block in the 3D view. */}
                    <span className="truck-3d__swatch" style={{ background: placementColor(index) }} aria-hidden="true" />
                    <span className="truck-3d__id">{shipment?.externalId ?? `Pošiljka #${p.shipmentId}`}</span>
                    <span className="truck-3d__ldm">{shipment ? `${formatLdm(shipment.ldmTenths)} LDM` : ''}</span>
                    {shipment && (
                      <span className="truck-3d__route">
                        <Icon name="pin" size={13} />
                        {locations.get(shipment.pickupLocationId) ?? '?'} → {locations.get(shipment.deliveryLocationId) ?? '?'}
                      </span>
                    )}
                    <span className="truck-3d__meta text--muted">
                      {[
                        unloaded !== undefined && `istovar ${unloaded}.`,
                        shipment?.weightKg != null && `${formatKg(shipment.weightKg)} kg`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </>
  )
}
