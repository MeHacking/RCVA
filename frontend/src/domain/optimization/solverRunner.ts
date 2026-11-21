import { solve, type SolverInput, type SolverOptions, type SolverResult } from './solver'

/**
 * Runs one solve; the local API client gets one injected, so tests need no Worker. `signal` stops
 * it ("Prekini"): the promise is then rejected.
 */
export type SolverRunner = (input: SolverInput, options: SolverOptions, signal?: AbortSignal) => Promise<SolverResult>

type WorkerAnswer = { ok: true; result: SolverResult } | { ok: false; message: string }

/** A new worker per job, ended when the job is done. */
export const runInWorker: SolverRunner = (input, options, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Stopped', 'AbortError'))
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
    signal?.addEventListener('abort', () => {
      worker.terminate()
      reject(new DOMException('Stopped', 'AbortError'))
    })
    worker.onmessage = (event: MessageEvent<WorkerAnswer>) => {
      worker.terminate()
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.message))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'Solver worker failed'))
    }
    worker.postMessage({ input, options })
  })

/** On the calling thread (unit tests). */
export const runInThread: SolverRunner = async (input, options) => solve(input, options)
