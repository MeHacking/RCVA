import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApi } from '../../api/apiContext'
import { Badge } from '../../components/Badge'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { ErrorState, LoadingState } from '../../components/states'
import type { Shipment, Truck } from '../../api/types'
import { formatKg, formatKm, formatLdm } from '../../format/units'
import { useAsyncData } from '../../hooks/useAsyncData'
import { NOT_FOUND_MESSAGE, PROVEN_TITLE } from '../optimization/jobStatus'
import { completedJob, isLastJobBusy, useLastJob } from '../optimization/lastJobContext'
import { ActivityChart } from './ActivityChart'
import { WarningsPanel } from './WarningsPanel'
import { BarList, Meter, StatusRing } from './DashboardCharts'
import { buildDashboardModel, truckLoads, type DashboardModel } from './dashboardModel'

export function DashboardPage() {
  const api = useApi()
  const load = useCallback(async () => {
    const [shipments, locations, trucks, starts, history] = await Promise.all([
      api.listShipments(),
      api.listLocations(),
      api.listTrucks(),
      api.getTruckStarts(),
      api.getOptimizationHistory(),
    ])
    return { model: buildDashboardModel(shipments, locations, trucks, starts), shipments, trucks, history }
  }, [api])
  const [data, reload] = useAsyncData(load)

  return (
    <section className="dashboard">
      <PageHeader title="Pregled" />
      {data.status === 'loading' && <LoadingState label="Učitavanje pregleda…" />}
      {data.status === 'error' && <ErrorState title="Pregled nije učitan" message={data.message} onRetry={reload} />}
      {data.status === 'success' && (
        <>
          <Cards model={data.data.model} />
          <div className="dashboard-grid">
            <FleetPanel model={data.data.model} />
            <StatusPanel model={data.data.model} />
          </div>
          {/* The last job on the left; on the right the warnings over the chart, level with it. */}
          <div className="dashboard-split">
            <div className="dashboard-split__grid">
              <LastJobPanel trucks={data.data.trucks} shipments={data.data.shipments} />
              <div className="dashboard-stack">
                <WarningsPanel model={data.data.model} />
                <ActivityPanel history={data.data.history} />
              </div>
            </div>
          </div>
          <QuickActions />
        </>
      )}
    </section>
  )
}

function Cards({ model }: { model: DashboardModel }) {
  return (
    <dl className="stats">
      <div className="stat">
        <dt>
          <Icon name="shipments" /> Pošiljke
        </dt>
        <dd className="stat__value">{model.shipmentCount}</dd>
        <dd className="stat__hint">ukupno uneto</dd>
      </div>
      <div className="stat">
        <dt>
          <Icon name="cube" /> Ukupno LDM
        </dt>
        <dd className="stat__value">{formatLdm(model.totalLdmTenths)}</dd>
        <dd className="stat__hint">
          {model.shipmentCount === 0
            ? 'nema pošiljki'
            : model.trucksLowerBound === null
              ? 'kamioni nisu dovoljni (videti upozorenja)'
              : `najmanje kamiona po kapacitetu: ${model.trucksLowerBound}`}
        </dd>
      </div>
      <div className="stat">
        <dt>
          <Icon name="weight" /> Ukupna težina
        </dt>
        <dd className="stat__value">{formatKg(model.totalWeightKg)} kg</dd>
        <dd className="stat__hint">pošiljka bez težine se računa kao 0 kg</dd>
      </div>
      <div className="stat">
        <dt>
          <Icon name="truck" /> Kamioni
        </dt>
        <dd className="stat__value">{model.availableTrucks}</dd>
        <dd className="stat__hint">
          dostupno od {model.totalTrucks} · {formatLdm(model.availableCapacityTenths)} LDM
        </dd>
      </div>
      <div className="stat">
        <dt>
          <Icon name="alert" /> Pošiljke sa greškom
        </dt>
        <dd className={`stat__value${model.shipmentsWithErrors > 0 ? ' text--error' : ''}`}>
          {model.shipmentsWithErrors}
        </dd>
        <dd className="stat__hint">nejasna lokacija</dd>
      </div>
    </dl>
  )
}

/** All shipments against the available trucks: will they carry it? */
function FleetPanel({ model }: { model: DashboardModel }) {
  const ldm = (tenths: number) => `${formatLdm(tenths)} LDM`
  const kg = (value: number) => `${formatKg(value)} kg`
  return (
    <section className="panel dashboard-panel" aria-labelledby="dashboard-fleet">
      <h2 id="dashboard-fleet">Pošiljke prema kamionima</h2>
      {model.availableTrucks === 0 ? (
        <p className="text--muted">Nijedan kamion nije dostupan.</p>
      ) : (
        <>
          <Meter label="LDM prema kapacitetu" used={model.totalLdmTenths} capacity={model.availableCapacityTenths} format={ldm} />
          {model.availableCapacityKg === null ? (
            <p className="meter__plain">
              <span className="meter__label">Težina prema nosivosti</span>
              <span className="text--muted">{kg(model.totalWeightKg)}; nosivost nije ograničena (kamion bez nosivosti)</span>
            </p>
          ) : (
            <Meter label="Težina prema nosivosti" used={model.totalWeightKg} capacity={model.availableCapacityKg} format={kg} />
          )}
        </>
      )}
      <p className="text--muted dashboard-panel__note">
        Svi dostupni kamioni zajedno; pošiljke se ne dele, pa i ispod 100 % može trebati kamion više.
      </p>
    </section>
  )
}

function StatusPanel({ model }: { model: DashboardModel }) {
  return (
    <section className="panel dashboard-panel" aria-labelledby="dashboard-status">
      <h2 id="dashboard-status">Status pošiljki</h2>
      {model.shipmentCount === 0 ? (
        <p className="text--muted">Nema unetih pošiljki.</p>
      ) : (
        <StatusRing counts={model.statusCounts} />
      )}
      {model.statusCounts.LOCATION_ERROR > 0 && (
        <p className="dashboard-panel__links">
          <Link to="/shipments">Ispravite nejasne lokacije</Link>
        </p>
      )}
    </section>
  )
}

/** How many optimizations were started per day, week or month. */
function ActivityPanel({ history }: { history: string[] | null }) {
  return (
    <section className="panel" aria-labelledby="dashboard-activity">
      <h2 id="dashboard-activity">Pokrenute optimizacije</h2>
      {history === null ? (
        <p className="text--muted">Istorija pokretanja nije dostupna: backend je ne čuva.</p>
      ) : (
        <ActivityChart history={history} />
      )}
    </section>
  )
}

function LastJobPanel({ trucks, shipments }: { trucks: Truck[]; shipments: Shipment[] }) {
  const { state } = useLastJob()
  const completed = completedJob(state)

  let body
  if (completed) {
    const { job, result } = completed
    body = (
      <>
        <p className="dashboard-panel__line">
          <Badge tone={result.validation.passed ? 'success' : 'danger'}>
            {result.validation.passed ? 'Validator: prošao' : 'Validator: nije prošao'}
          </Badge>
          <span className="text--muted">Posao #{job.id}</span>
        </p>
        <dl className="dashboard-facts">
          <div>
            <dt>Kamioni</dt>
            <dd>
              {result.trucksUsed}
              <span className="text--muted"> (donja granica {result.trucksLowerBound})</span>
            </dd>
          </div>
          <div>
            <dt>Kilometraža</dt>
            <dd>{formatKm(result.totalMeters)}</dd>
          </div>
          <div>
            <dt>Nedodeljene pošiljke</dt>
            <dd>{result.unassignedShipmentIds.length}</dd>
          </div>
        </dl>
        <TruckCharts loads={truckLoads(result, trucks, shipments)} />
        <p className="dashboard-panel__links">
          <Link to="/optimization">Detalji rezultata</Link>
          <Link to="/route-map">Rute</Link>
        </p>
      </>
    )
  } else if (isLastJobBusy(state)) {
    body = <LoadingState label="Optimizacija je u toku; rezime se pojavljuje kada posao završi." />
  } else if (state.kind === 'idle') {
    body = <p className="text--muted">Optimizacija još nije pokretana.</p>
  } else if (state.kind === 'proven') {
    body = (
      <p className="text--error">
        {PROVEN_TITLE}: {state.causes.join(' ') || state.detail}
      </p>
    )
  } else if (state.kind === 'tracking' && state.job?.infeasibilityKind === 'NOT_FOUND') {
    body = <p className="text--warning">{NOT_FOUND_MESSAGE}</p>
  } else {
    body = <p className="text--error">Poslednja optimizacija nije dala rezultat.</p>
  }

  return (
    <section className="panel dashboard-panel" aria-labelledby="dashboard-last-job">
      <h2 id="dashboard-last-job">Poslednja optimizacija</h2>
      {body}
      {!completed && state.kind !== 'idle' && !isLastJobBusy(state) && (
        <p className="dashboard-panel__links">
          <Link to="/optimization">Rezultati optimizacije</Link>
        </p>
      )}
    </section>
  )
}

/** The trucks of the last result: how full each is, and how far it drives. */
function TruckCharts({ loads }: { loads: ReturnType<typeof truckLoads> }) {
  if (loads.length === 0) return null
  const ldm = (tenths: number) => `${formatLdm(tenths)} LDM`
  return (
    <>
      <h3 className="dashboard-panel__subtitle">Popunjenost kamiona</h3>
      <ul className="truck-loads" aria-label="Popunjenost kamiona">
        {loads.map((load) => (
          <li key={load.truckId} className="truck-loads__item">
            <span className="truck-loads__name">
              <span className="route-swatch" style={{ background: `var(--route-${load.color})` }} aria-hidden="true" />
              {load.name}
            </span>
            {load.capacityLdmTenths === null ? (
              <span className="text--muted">{ldm(load.usedLdmTenths)}</span>
            ) : (
              <Meter label={`${load.name}, LDM`} used={load.usedLdmTenths} capacity={load.capacityLdmTenths} format={ldm} compact />
            )}
          </li>
        ))}
      </ul>
      <h3 className="dashboard-panel__subtitle">Kilometri po kamionu</h3>
      <BarList
        label="Kilometri po kamionu"
        items={loads.map((load) => ({ key: load.truckId, name: load.name, value: load.meters, text: formatKm(load.meters), swatch: load.color }))}
      />
    </>
  )
}

function QuickActions() {
  const navigate = useNavigate()
  const { state, start } = useLastJob()
  return (
    <section className="panel" aria-labelledby="dashboard-actions">
      <h2 id="dashboard-actions">Brze akcije</h2>
      <div className="quick-actions">
        <button type="button" onClick={() => navigate('/shipments/import')}>
          <Icon name="shipments" /> Uvezi Excel
        </button>
        <button type="button" onClick={() => navigate('/trucks')}>
          <Icon name="truck" /> Uredi kamione
        </button>
        <button
          type="button"
          className="button--primary"
          onClick={() =>
            void start().then((kind) => {
              // Truck locations and missing trucks are answered on the results screen.
              if (kind === 'needsLocations' || kind === 'proven') navigate('/optimization')
            })
          }
          disabled={isLastJobBusy(state)}
        >
          <Icon name="play" size={14} /> Pokreni optimizaciju
        </button>
        <button type="button" onClick={() => navigate('/optimization')}>
          <Icon name="results" /> Rezultati
        </button>
      </div>
    </section>
  )
}
