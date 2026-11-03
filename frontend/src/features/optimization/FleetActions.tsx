import { useCallback, useState } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { OptimizationResult } from '../../api/types'
import { Notice } from '../../components/Notice'
import { ErrorState, LoadingState } from '../../components/states'
import { nextStandardName, STANDARD_TRUCK } from '../../domain/fleet'
import { formatKm } from '../../format/units'
import { useAsyncData } from '../../hooks/useAsyncData'
import { TruckLocations } from '../trucks/TruckLocations'
import { useLastJob, type StartOptions } from './lastJobContext'

// What the user decides about the fleet on the device: where the trucks are before a job,
// trucks that are missing, and the advice "one more truck, fewer kilometres".

/** "1 ceradu", "2 cerade", "5 cerada" */
function curtainSiders(count: number): string {
  const tens = count % 100
  if (count % 10 === 1 && tens !== 11) return `${count} ceradu`
  if (count % 10 >= 2 && count % 10 <= 4 && (tens < 12 || tens > 14)) return `${count} cerade`
  return `${count} cerada`
}

/** Adds standard curtain-siders named "Kamion N"; where they are is asked before the next job. */
function useAddTrucks(): (count: number) => Promise<void> {
  const api = useApi()
  return useCallback(
    async (count: number) => {
      const names = (await api.listTrucks()).map((t) => t.name)
      for (let i = 0; i < count; i++) {
        const name = nextStandardName(names)
        names.push(name)
        await api.createTruck({ name, ...STANDARD_TRUCK, available: true })
      }
    },
    [api],
  )
}

/** Runs one action at a time and shows its error. */
function useAction(): [boolean, string | null, (action: () => Promise<unknown>) => void] {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    action()
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false))
  }
  return [busy, error, run]
}

/** The trucks cannot carry everything: add standard trucks, or plan without some shipments. */
export function ShortageActions({ add, options }: { add: number; options: StartOptions }) {
  const { start } = useLastJob()
  const addTrucks = useAddTrucks()
  const [busy, error, run] = useAction()
  return (
    <>
      <div className="form-actions">
        <button
          type="button"
          className="button--primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await addTrucks(add)
              await start(options)
            })
          }
        >
          Dodaj {curtainSiders(add)}
        </button>
        {!options.allowUnassigned && (
          <button type="button" disabled={busy} onClick={() => run(() => start({ ...options, allowUnassigned: true }))}>
            Optimizuj bez nekih pošiljki
          </button>
        )}
      </div>
      <p className="text--muted">
        Dodati kamioni su standardne cerade (13,6 LDM, 24 t); pre pokretanja unesite gde se nalaze. Bez njih optimizacija
        raspoređuje koliko staje, a ostale pošiljke navodi kao nedodeljene.
      </p>
      {error && (
        <p role="alert" className="text--error">
          {error}
        </p>
      )}
    </>
  )
}

/** One more truck would save at least the share in the settings. */
export function ExtraTruckNotice({ result, options }: { result: OptimizationResult; options: StartOptions }) {
  const { start } = useLastJob()
  const addTrucks = useAddTrucks()
  const [busy, error, run] = useAction()
  const advice = result.extraTruck
  if (!advice) return null
  const more = { ...options, allowUnassigned: false, freeTrucks: advice.trucksUsed }
  return (
    <Notice tone="info" title="Sa jednim kamionom više bilo bi manje kilometara" role="status">
      <p>
        Sa {advice.trucksUsed} kamiona ukupno bi bilo <strong>{formatKm(advice.totalMeters)}</strong> umesto{' '}
        {formatKm(result.totalMeters)} (−{advice.savingPercent} %).
      </p>
      <p className="text--muted">
        {advice.newTruck
          ? 'Za to treba još jedan kamion. Računat je kao da kreće iz prvog magacina, bez prazne vožnje, pa stvarna ušteda zavisi od toga gde se nalazi.'
          : 'Dovoljan je jedan od dostupnih kamiona koje ovaj rezultat ne koristi.'}
      </p>
      <div className="form-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (advice.newTruck) await addTrucks(1)
              await start(more)
            })
          }
        >
          {advice.newTruck ? 'Dodaj kamion i pokreni ponovo' : `Pokreni sa ${advice.trucksUsed} kamiona`}
        </button>
      </div>
      {error && (
        <p role="alert" className="text--error">
          {error}
        </p>
      )}
    </Notice>
  )
}

/** Before a job on the device: every available truck needs a confirmed location. */
export function LocationsCheck({ options }: { options: StartOptions }) {
  const api = useApi()
  const { start } = useLastJob()
  const load = useCallback(async () => ({ trucks: await api.listTrucks(), starts: (await api.getTruckStarts()) ?? [] }), [api])
  const [data, reload] = useAsyncData(load)
  if (data.status === 'loading') return <LoadingState label="Učitavanje kamiona…" />
  if (data.status === 'error') return <ErrorState title="Kamioni nisu učitani" message={data.message} onRetry={reload} />

  const available = data.data.trucks.filter((t) => t.available)
  const byTruck = new Map(data.data.starts.map((s) => [s.truckId, s]))
  const waiting = available.filter((t) => !byTruck.get(t.id)?.location || byTruck.get(t.id)?.proposal).length
  return (
    <section className="panel" aria-labelledby="locations-check">
      <h2 id="locations-check">Gde su kamioni?</h2>
      <p>
        Ruta svakog kamiona počinje tamo gde se kamion nalazi. Unesite mesto kamiona koji ga nema, a za predlog (mesto
        poslednje isporuke) izaberite da li ga potvrđujete ili zadržavate sadašnju lokaciju.
      </p>
      <TruckLocations trucks={available} starts={data.data.starts} onChanged={reload} />
      <div className="form-actions">
        <button type="button" className="button--primary" disabled={waiting > 0} onClick={() => void start(options)}>
          Pokreni optimizaciju
        </button>
        <span className={waiting > 0 ? 'text--error' : 'text--muted'} role="status">
          {waiting > 0 ? `Čeka odgovor: ${waiting} ${waiting === 1 ? 'kamion' : 'kamiona'}.` : 'Svi kamioni imaju potvrđenu lokaciju.'}
        </span>
      </div>
    </section>
  )
}
