import { solve, type SolverInput, type SolverOptions } from './solver'

// Web Worker entry: runs one solve off the main thread, so the screens stay responsive
// for the whole time limit. Started and ended by runInWorker (solverRunner.ts).

export interface SolveRequest {
  input: SolverInput
  options: SolverOptions
}

self.onmessage = (event: MessageEvent<SolveRequest>) => {
  const { input, options } = event.data
  try {
    self.postMessage({ ok: true, result: solve(input, options) })
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}
