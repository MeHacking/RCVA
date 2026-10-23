// Frontend types aligned with "Specifikacija v2", sections 5 (data model) and 6 (API).
// Units: LDM x 10 as integers (`...LdmTenths`), distances in metres, 3D coordinates in mm.
// Deviations from the specification are marked with "NOT IN SPEC v2".

export type GeocodeStatus = 'OK' | 'MANUAL' | 'FAILED'

export interface Location {
  id: number
  name: string
  address: string | null
  country: string | null
  postalCode: string | null
  /** null until geocoded */
  lat: number | null
  lon: number | null
  geocodeStatus: GeocodeStatus
}

export interface Shipment {
  id: number
  /** unique business id from Excel */
  externalId: string
  description: string | null
  ldmTenths: number
  pickupLocationId: number
  deliveryLocationId: number
  /** not used by the solver in the MVP */
  splittable: boolean
  /** informative only, not a constraint */
  weightKg: number | null
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
}

export interface Truck {
  id: number
  name: string
  capacityLdmTenths: number
  /** unavailable trucks are not sent to the solver */
  available: boolean
  innerLengthMm: number | null
  innerWidthMm: number | null
  innerHeightMm: number | null
}

/** Body of POST /trucks and PUT /trucks/{id} */
export type TruckInput = Omit<Truck, 'id'>

export interface BaseSettings {
  baseLocationId: number
  returnToBase: boolean
}

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'INFEASIBLE' | 'CANCELLED' | 'FAILED'

/**
 * PROVEN: infeasibility proven before solving (POST returns 422, no job is created).
 * NOT_FOUND: the solver found no feasible solution within the time limit; a solution may still exist.
 */
export type InfeasibilityKind = 'PROVEN' | 'NOT_FOUND'

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ['COMPLETED', 'INFEASIBLE', 'CANCELLED', 'FAILED']

export interface OptimizationJobRequest {
  timeLimitSeconds: number
  /** null = all available trucks */
  truckIds: number[] | null
  /** null = all shipments */
  shipmentIds: number[] | null
}

/** Body of 202 Accepted from POST /optimization-jobs */
export interface OptimizationJobCreated {
  id: number
  status: JobStatus
}

/** GET /optimization-jobs/{id} */
export interface OptimizationJob {
  id: number
  status: JobStatus
  infeasibilityKind: InfeasibilityKind | null
  /** ISO 8601 */
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  timeLimitSeconds: number
  scoreHard: number | null
  scoreMedium: number | null
  scoreSoft: number | null
  feasible: boolean | null
  trucksLowerBound: number | null
}

export type StopType = 'PICKUP' | 'DELIVERY'

export interface RouteStop {
  sequence: number
  type: StopType
  shipmentId: number
  locationId: number
  /** truck load after this stop */
  loadAfterLdmTenths: number
  /** distance from the previous stop (or from the base for the first stop) */
  legMeters: number
}

export interface RoutePlan {
  truckId: number
  usedLdmTenths: number
  /** includes the return leg to the base, which is not a stop */
  totalMeters: number
  stops: RouteStop[]
}

export interface ValidationReport {
  passed: boolean
  violations: string[]
}

/** GET /optimization-jobs/{id}/result */
export interface OptimizationResult {
  status: JobStatus
  feasible: boolean
  trucksUsed: number
  trucksLowerBound: number
  totalMeters: number
  routes: RoutePlan[]
  /** NOT IN SPEC v2: required by the Optimization Results screen ("nedodeljene pošiljke") */
  unassignedShipmentIds: number[]
  /** filled in by the independent SolutionValidator, not by the solver */
  validation: ValidationReport
}

export type LoadPlanMode = 'ILLUSTRATIVE_LDM' | 'DIMENSIONAL'

/** Coordinates in mm, origin in a corner of the cargo space */
export interface Placement {
  shipmentId: number
  xMm: number
  yMm: number
  zMm: number
  lengthMm: number
  widthMm: number
  heightMm: number
  rotated: boolean
}

/** GET /optimization-jobs/{id}/trucks/{truckId}/load-plan */
export interface LoadPlan {
  jobId: number
  truckId: number
  mode: LoadPlanMode
  placements: Placement[]
  warnings: string[]
}

/** Error body, RFC 9457 Problem Details with extension members */
export interface ProblemDetails {
  type?: string
  title: string
  status: number
  detail?: string
  /** 422 from POST /optimization-jobs */
  infeasibilityKind?: InfeasibilityKind
  causes?: string[]
  /** field name -> message, for 400 validation errors */
  errors?: Record<string, string>
}
