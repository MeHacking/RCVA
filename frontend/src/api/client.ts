import type {
  BaseSettings,
  DeviceDataFile,
  DeviceDataSummary,
  DeviceSettings,
  ImportCommitProgress,
  ImportCommitResult,
  ImportCreated,
  ImportMapping,
  ImportPreview,
  ImportRow,
  ImportRowPatch,
  LoadPlan,
  Location,
  OptimizationJob,
  OptimizationJobCreated,
  OptimizationJobRequest,
  OptimizationResult,
  ProblemDetails,
  RouteLine,
  Shipment,
  Truck,
  TruckInput,
} from './types'

/**
 * The only API surface screens may depend on. Mirrors the REST API from
 * "Specifikacija v2", section 6 (prefix /api/v1). Endpoints for shipment editing,
 * cancel and export are added together with their screens.
 *
 * Every method rejects with ApiError on a non-2xx response.
 */
export interface ApiClient {
  listLocations(): Promise<Location[]>
  listShipments(): Promise<Shipment[]>
  /**
   * NOT IN SPEC v2: removes every shipment, and the places nothing uses any more (places of
   * kept results stay); for a new week's import. 409 while a job waits or runs; 404 over HTTP.
   */
  deleteAllShipments(): Promise<{ shipments: number; locations: number }>

  listTrucks(): Promise<Truck[]>
  createTruck(input: TruckInput): Promise<Truck>
  updateTruck(id: number, input: TruckInput): Promise<Truck>
  /** DELETE /trucks/{id} (204); 409 while an optimization job is queued or running */
  deleteTruck(id: number): Promise<void>

  getBase(): Promise<BaseSettings>

  /** 202 on success; 422 with infeasibilityKind PROVEN when infeasibility is proven up front */
  createOptimizationJob(request: OptimizationJobRequest): Promise<OptimizationJobCreated>
  getOptimizationJob(id: number): Promise<OptimizationJob>
  /**
   * NOT IN SPEC v2 (proposed in dopuna 1 as GET /optimization-jobs/latest): the most
   * recently created job, so the screens find it again after a page reload; null when
   * there is none. The backend does not have it yet, so over HTTP it is always null.
   */
  getLatestOptimizationJob(): Promise<OptimizationJob | null>
  /** Only for COMPLETED jobs; 409 otherwise */
  getOptimizationResult(id: number): Promise<OptimizationResult>
  /** GET /optimization-jobs/{id}/trucks/{truckId}/load-plan; 409 when the truck has no cargo dimensions */
  getLoadPlan(jobId: number, truckId: number): Promise<LoadPlan>
  /**
   * NOT IN SPEC v2: the route of a truck along the roads, for the map. null when there is
   * none: the mock and the backend have no roads, and the application on the device needs
   * an ORS key. 404 for an unknown job or truck, 409 for a job that is not COMPLETED, 502
   * when OpenRouteService does not answer.
   */
  getRouteLine(jobId: number, truckId: number): Promise<RouteLine | null>

  /** POST /imports/excel; 415 for a non-.xlsx file, 400 when the file cannot be read */
  createImport(file: File): Promise<ImportCreated>
  /** PUT /imports/{id}/mapping; re-reads all rows, discarding earlier corrections */
  setImportMapping(importId: number, mapping: ImportMapping): Promise<void>
  getImportPreview(importId: number): Promise<ImportPreview>
  /** NOT IN SPEC v2: PUT /imports/{id}/rows/{rowNumber}, manual correction of one row */
  updateImportRow(importId: number, rowNumber: number, patch: ImportRowPatch): Promise<ImportRow>
  /**
   * POST /imports/{id}/commit. NOT IN SPEC v2: `onProgress` follows the coordinate lookup
   * of the places (the application on the device asks Nominatim, one place per second);
   * over HTTP it is never called.
   */
  commitImport(importId: number, options?: { onProgress?: (progress: ImportCommitProgress) => void }): Promise<ImportCommitResult>

  /** NOT IN SPEC v2: settings of the application on the device; null for the mock and the backend */
  getDeviceSettings(): Promise<DeviceSettings | null>
  /** NOT IN SPEC v2: 400 with `errors.contactEmail` for a bad e-mail; 404 where there are no settings */
  updateDeviceSettings(settings: DeviceSettings): Promise<DeviceSettings>

  /** NOT IN SPEC v2: all data of the application on the device, without the ORS key; null for the mock and the backend */
  exportDeviceData(): Promise<DeviceDataFile | null>
  /** NOT IN SPEC v2: checks a data file and says what it holds, changing nothing; 400 with the reason for a bad file */
  checkDeviceData(content: string): Promise<DeviceDataSummary>
  /**
   * NOT IN SPEC v2: replaces all data on the device with the file's (the device keeps its
   * own ORS key). 400 for a bad file (nothing changes), 409 while a job waits or runs, 404
   * where there is no data on the device.
   */
  replaceDeviceData(content: string): Promise<DeviceDataSummary>
}

export class ApiError extends Error {
  readonly status: number
  readonly problem: ProblemDetails

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.status = problem.status
    this.problem = problem
  }
}

/** User-facing message for any error thrown by an ApiClient call */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (HTTP ${error.status})`
  if (error instanceof Error) return error.message
  return 'Nepoznata greška.'
}

export function isProvenInfeasible(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 422 && error.problem.infeasibilityKind === 'PROVEN'
}
