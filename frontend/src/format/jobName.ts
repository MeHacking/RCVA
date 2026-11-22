import type { OptimizationJob, OptimizationResult } from '../api/types'
import { formatTruckCount } from './count'
import { formatKm } from './units'

/*
 * Names of optimizations instead of numbers (owner, 22.11.2026): a saved one is called by the
 * name it was given, or by its result ("3 kamiona - 1001,5 km", as smartLoad+ names by its result);
 * the one not saved is "Poslednja optimizacija".
 */

export const UNSAVED_JOB_NAME = 'Poslednja optimizacija'

/** The usual name of a saved optimization: its trucks and kilometres. */
export function defaultJobName(result: Pick<OptimizationResult, 'trucksUsed' | 'totalMeters'> | null): string {
  return result ? `${formatTruckCount(result.trucksUsed)} - ${formatKm(result.totalMeters)}` : 'Bez rezultata'
}

/** What a job is called on the screens and in file names. */
export function jobLabel(job: Pick<OptimizationJob, 'saved' | 'name'>, result: Parameters<typeof defaultJobName>[0]): string {
  if (job.saved === false) return UNSAVED_JOB_NAME
  return job.name?.trim() || defaultJobName(result)
}
