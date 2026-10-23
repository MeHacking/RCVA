/** `?job=1&truck=2` as linked from the results table; anything not a positive integer is ignored. */
export interface RouteMapParams {
  jobId: number | null
  truckId: number | null
}

export function parseRouteMapParams(params: URLSearchParams): RouteMapParams {
  return { jobId: positiveInt(params.get('job')), truckId: positiveInt(params.get('truck')) }
}

function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return parsed > 0 && Number.isSafeInteger(parsed) ? parsed : null
}
