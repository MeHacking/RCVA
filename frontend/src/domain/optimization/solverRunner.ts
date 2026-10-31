import { solve, type SolverInput, type SolverOptions, type SolverResult } from './solver'

/** Runs one solve; the local API client gets one injected, so tests need no Worker. */
export type SolverRunner = (input: SolverInput, options: SolverOptions) => Promise<SolverResult>

type WorkerAnswer = { ok: true; result: SolverResult } | { ok: false; message: string }

/** A new worker per job, ended when the job is done. */
export const runInWorker: SolverRunner = (input, options) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
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
