import { BookmarkCheck, Save } from 'lucide-react'
import { useState } from 'react'
import { useApi } from '../../api/apiContext'
import { ApiError, describeError } from '../../api/client'
import type { OptimizationJob, OptimizationResult } from '../../api/types'
import { defaultJobName, jobLabel } from '../../format/jobName'
import { useLastJob } from './lastJobContext'
import { NameDialog } from './NameDialog'

/**
 * "Sačuvaj" at the end of Rezultat, as in smartLoad+ (owner, 22.11.2026): only a saved
 * optimization goes into Istorija; one not saved is replaced by the next. Saved, it says under what
 * name, and the name can be changed. When Istorija is full, the oldest may be deleted for it.
 */
export function SaveResult({ job, result }: { job: OptimizationJob; result: OptimizationResult }) {
  const api = useApi()
  const { updateJob } = useLastJob()
  const [naming, setNaming] = useState<'saved' | 'rename' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saved = job.saved !== false
  const usualName = defaultJobName(result)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      updateJob(await api.saveOptimizationJob(job.id, null))
      setNaming('saved')
    } catch (failure) {
      if (failure instanceof ApiError && failure.problem.title === 'Istorija je puna' && (await makeRoom())) return save()
      setError(`Nije sačuvano: ${describeError(failure)}`)
    } finally {
      setBusy(false)
    }
  }

  /** Istorija is full: asks to delete the oldest saved optimization. */
  async function makeRoom(): Promise<boolean> {
    const kept = (await api.listOptimizationJobs()) ?? []
    const oldest = kept.at(-1)
    if (!oldest) return false
    const ok = window.confirm(`Istorija je puna (${kept.length}). Obrisati najstariju optimizaciju, „${oldest.name}“, i sačuvati ovu?`)
    if (!ok) return false
    await api.deleteOptimizationJob(oldest.job.id)
    return true
  }

  async function rename(name: string | null) {
    setNaming(null)
    if (name === null) return
    try {
      updateJob(await api.saveOptimizationJob(job.id, name || null))
    } catch (failure) {
      setError(`Ime nije promenjeno: ${describeError(failure)}`)
    }
  }

  // Only the button, at the right (owner, 22.11.2026: no bar describing it); the name is in the line
  // above the cards.
  return (
    <section className="save-result" aria-label="Čuvanje u istoriji">
      {saved ? (
        <>
          <span className="save-result__done">
            <BookmarkCheck aria-hidden="true" size={18} />
            Sačuvano
          </span>
          <button type="button" onClick={() => setNaming('rename')}>
            Preimenuj
          </button>
        </>
      ) : (
        <button type="button" className="button--primary" onClick={() => void save()} disabled={busy}>
          <Save aria-hidden="true" size={16} />
          Sačuvaj
        </button>
      )}
      {error && (
        <p role="alert" className="text--error save-result__error">
          {error}
        </p>
      )}
      {naming && (
        <NameDialog
          title={naming === 'saved' ? 'Sačuvano u istoriji' : 'Novo ime'}
          text={
            naming === 'saved'
              ? 'Možete dati ime ovoj optimizaciji. Ako ga ne promenite, ostaje naziv po rezultatu.'
              : 'Ime pod kojim se optimizacija vidi u istoriji.'
          }
          name={jobLabel({ ...job, saved: true }, result)}
          usualName={usualName}
          onDone={(name) => void rename(name)}
        />
      )}
    </section>
  )
}
