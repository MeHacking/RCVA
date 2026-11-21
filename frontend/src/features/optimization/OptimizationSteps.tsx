import { useCallback, useId, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Play } from 'lucide-react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import { PATHS } from '../../app/paths'
import { Notice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { ErrorState, LoadingState } from '../../components/states'
import { useAsyncData } from '../../hooks/useAsyncData'
import { LocationsCheck } from './FleetActions'
import { JobClockText } from './JobClockText'
import { completedJob, isLastJobBusy, useLastJob } from './lastJobContext'
import { StepNav } from './OptimizationLayout'
import { announceTruckStarts, stepContext } from './steps'
import { TimerDial } from './TimerDial'
import { loadTimeLimit, parseTimeLimit, saveTimeLimit } from './timeLimit'

// ---- 2. Lokacije kamiona ---------------------------------------------------------------------

/** Where the trucks are: a job's routes start there; asked before every job on the device. */
export function TruckLocationsStep() {
  const api = useApi()
  const { state } = useLastJob()
  const load = useCallback(() => api.getTruckStarts(), [api])
  const [starts, reload] = useAsyncData(load)
  return (
    <>
      <PageHeader title="Lokacije kamiona" context={stepContext(PATHS.truckLocations)} />
      {starts.status === 'loading' && <LoadingState label="Učitavanje kamiona…" />}
      {starts.status === 'error' && <ErrorState title="Lokacije kamiona nisu učitane" message={starts.message} onRetry={reload} />}
      {starts.status === 'success' &&
        (starts.data === null ? (
          <Notice tone="info" title="Kamioni kreću iz baze">
            <p>U ovom režimu rute počinju u bazi, pa lokacije kamiona nisu potrebne.</p>
          </Notice>
        ) : (
          // A start that waits for the answers goes on from here.
          <LocationsCheck options={state.kind === 'needsLocations' ? state.options : null} />
        ))}
      <p className="text--muted">
        Kamione, njihove kapacitete i mapu sa lokacijama uređujete na ekranu <Link to="/trucks">Kamioni</Link>.
      </p>
      <StepNav at={PATHS.truckLocations} />
    </>
  )
}

// ---- 3. Vreme ----------------------------------------------------------------------------------

/** The time limit (a stopwatch tied to the field, as smartLoad+'s "Trajanje"), and the start. */
export function TimeStep() {
  const { state, start } = useLastJob()
  const navigate = useNavigate()
  const id = useId()
  const [text, setText] = useState(() => String(loadTimeLimit()))
  const [error, setError] = useState<string | null>(null)
  const seconds = parseTimeLimit(text)
  const busy = isLastJobBusy(state)

  function change(next: string) {
    setText(next)
    setError(null)
    const parsed = parseTimeLimit(next)
    if (parsed !== null) saveTimeLimit(parsed)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (seconds === null) {
      setError('Unesite ceo broj sekundi veći od 0.')
      return
    }
    saveTimeLimit(seconds)
    // The result shows the count at once; a start that waits for the trucks' locations goes back there.
    void navigate(PATHS.result)
    const kind = await start({ timeLimitSeconds: seconds })
    if (kind === 'needsLocations') void navigate(PATHS.truckLocations)
  }

  return (
    <>
      <PageHeader title="Vremensko ograničenje" context={stepContext(PATHS.time)} />
      <form className="panel" onSubmit={(e) => void handleSubmit(e)} noValidate aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>Koliko dugo optimizacija traži rešenje</h2>
        <p className="text--muted">
          Koriste se svi dostupni kamioni i sve pošiljke. Optimizacija vraća najbolje rešenje nađeno u tom vremenu; duže
          vreme daje bolje rešenje kod mnogo pošiljki. Zadato vreme važi za celu optimizaciju, i za preporuku dodatnog
          kamiona.
        </p>
        <div className="time-step">
          <TimerDial label="Trajanje" seconds={seconds ?? Number.NaN} onChange={(n) => change(String(n))} />
          <div className="time-step__controls">
            <div className="field">
              <label htmlFor={`${id}-limit`}>Vremensko ograničenje (s)</label>
              <input
                id={`${id}-limit`}
                inputMode="numeric"
                value={text}
                onChange={(e) => change(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-limit-error` : `${id}-limit-hint`}
              />
              {error ? (
                <span id={`${id}-limit-error`} className="field__error">
                  {error}
                </span>
              ) : (
                <span id={`${id}-limit-hint`} className="text--muted">
                  U sekundama. Brojčanik ide do 10 minuta; duže vreme upišite ovde. Pamti se i za dugme gore desno.
                </span>
              )}
            </div>
            {busy ? (
              <button type="button" className="button--primary run-clock" disabled>
                <span className="spinner spinner--small" aria-hidden="true" />
                <JobClockText />
              </button>
            ) : (
              <button type="submit" className="button--primary">
                <Play aria-hidden="true" size={16} />
                Pokreni optimizaciju
              </button>
            )}
          </div>
        </div>
      </form>
      <StepNav at={PATHS.time} />
    </>
  )
}

// ---- 4. Rezultat -------------------------------------------------------------------------------

/** The result: its views (Rute, Mapa ruta, 3D prikaz kamiona), all trucks or one (?truck=). */
export function ResultStep() {
  const { search } = useLocation()
  const { state } = useLastJob()
  // The chosen truck stays when the view changes; the job (?job=) is the one shown.
  const keep = new URLSearchParams(search)
  keep.delete('job')
  const query = keep.toString() ? `?${keep.toString()}` : ''
  return (
    <>
      <PageHeader title="Rezultat" context={stepContext(PATHS.result)} />
      <nav className="result-views" aria-label="Prikaz rezultata">
        <NavLink end className="result-views__item" to={`${PATHS.result}${query}`}>
          Rute
        </NavLink>
        <NavLink className="result-views__item" to={`${PATHS.resultMap}${query}`}>
          Mapa ruta
        </NavLink>
        <NavLink className="result-views__item" to={`${PATHS.result3d}${query}`}>
          3D prikaz kamiona
        </NavLink>
      </nav>
      {state.kind === 'tracking' && state.fromHistory && (
        <Notice tone="info" title={`Prikazan je posao #${state.jobId} iz Istorije`} role="status">
          <p>
            Nova optimizacija ga zamenjuje poslednjom; ostali poslovi su u <Link to="/history">Istoriji</Link>.
          </p>
        </Notice>
      )}
      <NewLocationsOffer />
      <Outlet />
      <StepNav at={PATHS.result} />
    </>
  )
}

/**
 * After every optimization (user, 21.11.2026): the trucks may start the next one where their
 * routes ended. The last delivery of each used truck is proposed; here all are answered at once,
 * one by one in the step "Lokacije kamiona".
 */
function NewLocationsOffer() {
  const api = useApi()
  const { state } = useLastJob()
  const completed = completedJob(state)
  const jobId = completed?.job.id ?? null
  const load = useCallback(async () => {
    if (jobId === null) return null
    const [starts, trucks] = [await api.getTruckStarts(), await api.listTrucks()]
    if (!starts) return null
    const names = new Map(trucks.map((t) => [t.id, t.name]))
    return starts.flatMap((s) =>
      s.proposal && s.proposal.jobId === jobId ? [{ truckId: s.truckId, name: names.get(s.truckId) ?? `Kamion #${s.truckId}`, place: s.proposal.location.name, from: s.location?.name ?? null }] : [],
    )
  }, [api, jobId])
  const [offer, reload] = useAsyncData(load)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  async function answerAll(moved: boolean) {
    if (offer.status !== 'success' || !offer.data || jobId === null) return
    setPending(true)
    try {
      for (const truck of offer.data) {
        await api.setTruckStart(truck.truckId, moved ? { proposalJobId: jobId } : { keep: true })
      }
      setMessage({
        tone: 'success',
        text: moved ? 'Kamioni kreću sledeću optimizaciju sa mesta poslednje isporuke.' : 'Kamioni su zadržali sadašnje lokacije.',
      })
      reload()
    } catch (error) {
      setMessage({ tone: 'danger', text: `Lokacije nisu sačuvane: ${describeError(error)}` })
      reload()
    } finally {
      setPending(false)
      announceTruckStarts()
    }
  }

  if (message) {
    return (
      <Notice tone={message.tone} title={message.text} role="status">
        {message.tone === 'success' && (
          <p>
            Pojedinačno ih menjate u koraku <Link to={PATHS.truckLocations}>Lokacije kamiona</Link>.
          </p>
        )}
      </Notice>
    )
  }
  if (offer.status !== 'success' || !offer.data || offer.data.length === 0) return null
  return (
    <Notice tone="info" title="Gde kamioni kreću sledeću optimizaciju?" role="status">
      <p>Posle ove optimizacije kamioni su na mestu poslednje isporuke:</p>
      <ul className="notice__list">
        {offer.data.map((t) => (
          <li key={t.truckId}>
            <strong>{t.name}</strong>: {t.place}
            {t.from && <span className="text--muted"> (sada {t.from})</span>}
          </li>
        ))}
      </ul>
      <div className="form-actions">
        <button type="button" className="button--primary" disabled={pending} onClick={() => void answerAll(true)}>
          Premesti kamione na kraj ruta
        </button>
        <button type="button" disabled={pending} onClick={() => void answerAll(false)}>
          Zadrži sadašnje lokacije
        </button>
        <Link to={PATHS.truckLocations}>Pojedinačno</Link>
      </div>
    </Notice>
  )
}
