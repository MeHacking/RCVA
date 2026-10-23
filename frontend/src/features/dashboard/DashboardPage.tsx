import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApi } from '../../api/apiContext'
import { Badge } from '../../components/Badge'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { ErrorState, LoadingState } from '../../components/states'
import { formatKm, formatLdm } from '../../format/units'
import { useAsyncData } from '../../hooks/useAsyncData'
import { NOT_FOUND_MESSAGE, PROVEN_TITLE } from '../optimization/jobStatus'
import { completedJob, isLastJobBusy, useLastJob } from '../optimization/lastJobContext'
import { buildDashboardModel, type DashboardModel } from './dashboardModel'

export function DashboardPage() {
  const api = useApi()
  const load = useCallback(async () => {
    const [shipments, locations, trucks] = await Promise.all([api.listShipments(), api.listLocations(), api.listTrucks()])
    return buildDashboardModel(shipments, locations, trucks)
  }, [api])
  const [model, reload] = useAsyncData(load)

  return (
    <section>
      <PageHeader title="Pregled" />
      {model.status === 'loading' && <LoadingState label="Učitavanje pregleda…" />}
      {model.status === 'error' && <ErrorState title="Pregled nije učitan" message={model.message} onRetry={reload} />}
      {model.status === 'success' && (
        <>
          <Cards model={model.data} />
          <div className="dashboard-grid">
            <LastJobPanel />
            <WarningsPanel model={model.data} />
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
        <dt>Pošiljke</dt>
        <dd className="stat__value">{model.shipmentCount}</dd>
        <dd className="stat__hint">ukupno uneto</dd>
      </div>
      <div className="stat">
        <dt>Ukupno LDM</dt>
        <dd className="stat__value">{formatLdm(model.totalLdmTenths)}</dd>
        <dd className="stat__hint">
          {model.shipmentCount === 0
            ? 'nema pošiljki'
            : model.trucksLowerBound === null
              ? 'dostupni kamioni nisu dovoljni'
              : `najmanje kamiona po kapacitetu: ${model.trucksLowerBound}`}
        </dd>
      </div>
      <div className="stat">
        <dt>Kamioni</dt>
        <dd className="stat__value">{model.availableTrucks}</dd>
        <dd className="stat__hint">
          dostupno od {model.totalTrucks} · {formatLdm(model.availableCapacityTenths)} LDM
        </dd>
      </div>
      <div className="stat">
        <dt>Pošiljke sa greškom</dt>
        <dd className={`stat__value${model.shipmentsWithErrors > 0 ? ' text--error' : ''}`}>
          {model.shipmentsWithErrors}
        </dd>
        <dd className="stat__hint">nejasna lokacija</dd>
      </div>
    </dl>
  )
}

function LastJobPanel() {
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

function WarningsPanel({ model }: { model: DashboardModel }) {
  return (
    <section className="panel dashboard-panel" aria-labelledby="dashboard-warnings">
      <h2 id="dashboard-warnings">Upozorenja</h2>
      {model.warnings.length === 0 ? (
        <p className="dashboard-panel__line text--muted">
          <Icon name="check" /> Nema upozorenja za trenutne pošiljke i kamione.
        </p>
      ) : (
        <ul className="dashboard-warnings">
          {model.warnings.map((warning) => (
            <li key={warning.text} className={`dashboard-warnings__item dashboard-warnings__item--${warning.tone}`}>
              <Icon name="alert" />
              <span>
                {warning.text} <Link to={warning.link.to}>{warning.link.label}</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text--muted dashboard-panel__note">
        Crvena upozorenja su provere koje dokazuju da rešenje ne postoji (uz pretpostavku dve faze po ruti).
      </p>
    </section>
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
        <button type="button" className="button--primary" onClick={() => void start()} disabled={isLastJobBusy(state)}>
          <Icon name="play" size={14} /> Pokreni optimizaciju
        </button>
        <button type="button" onClick={() => navigate('/optimization')}>
          <Icon name="results" /> Rezultati
        </button>
      </div>
    </section>
  )
}
