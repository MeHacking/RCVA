import type {
  BaseSettings,
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

  listTrucks(): Promise<Truck[]>
  createTruck(input: TruckInput): Promise<Truck>
  updateTruck(id: number, input: TruckInput): Promise<Truck>
  /** DELETE /trucks/{id} (204); 409 while an optimization job is queued or running */
  deleteTruck(id: number): Promise<void>

  getBase(): Promise<BaseSettings>

  /** 202 on success; 422 with infeasibilityKind PROVEN when infeasibility is proven up front */
  createOptimizationJob(request: OptimizationJobRequest): Promise<OptimizationJobCreated>
  getOptimizationJob(id: number): Promise<OptimizationJob>
  /** Only for COMPLETED jobs; 409 otherwise */
  getOptimizationResult(id: number): Promise<OptimizationResult>
  /** GET /optimization-jobs/{id}/trucks/{truckId}/load-plan; 409 when the truck has no cargo dimensions */
  getLoadPlan(jobId: number, truckId: number): Promise<LoadPlan>

  /** POST /imports/excel; 415 for a non-.xlsx file, 400 when the file cannot be read */
  createImport(file: File): Promise<ImportCreated>
  /** PUT /imports/{id}/mapping; re-reads all rows, discarding earlier corrections */
  setImportMapping(importId: number, mapping: ImportMapping): Promise<void>
  getImportPreview(importId: number): Promise<ImportPreview>
  /** NOT IN SPEC v2: PUT /imports/{id}/rows/{rowNumber}, manual correction of one row */
  updateImportRow(importId: number, rowNumber: number, patch: ImportRowPatch): Promise<ImportRow>
  commitImport(importId: number): Promise<ImportCommitResult>
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
