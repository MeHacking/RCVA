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
  /**
   * NOT IN SPEC v2: payload in kg, a constraint since the process owner's answer B2.
   * null = weight is not limited (older data; the backend does not have it).
   */
  capacityKg: number | null
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
  /**
   * NOT IN SPEC v2: routes start at their first pickup and end at their last delivery
   * (process owner's answer A2), without the base. Missing (mock, server) = false.
   */
  openRoute?: boolean
  /** NOT IN SPEC v2: set only on the device; the mock and the backend use great-circle distances */
  distanceSource?: DistanceSource
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

// Excel import, Spec v2 section 6: POST /imports/excel, PUT /imports/{id}/mapping,
// GET /imports/{id}/preview, POST /imports/{id}/commit. Parsing happens on the server.

/** Fields a spreadsheet column can be mapped to. Either `relation` or `pickup` + `delivery`. */
export type ImportField =
  | 'externalId'
  | 'relation'
  | 'pickup'
  | 'delivery'
  | 'deliveryPostalCode'
  | 'ldm'
  | 'weight'
  | 'description'

export interface ImportSheetInfo {
  name: string
  rowCount: number
  /** first rows as text, for choosing the header row and columns */
  previewRows: string[][]
}

/** 201 from POST /imports/excel */
export interface ImportCreated {
  importId: number
  fileName: string
  sheets: ImportSheetInfo[]
}

export interface ImportMapping {
  sheetName: string
  /** 1-based spreadsheet row holding the column names; data starts below it */
  headerRow: number
  /** field -> 0-based column index */
  columns: Partial<Record<ImportField, number>>
}

/** A place as read from the file, before it becomes a Location */
export interface PlaceGuess {
  name: string
  postalCode: string | null
  /** ISO-like code as written in the file (RS, SE, NO, MK, BIH...) */
  country: string | null
}

export interface ImportRow {
  /** 1-based spreadsheet row */
  rowNumber: number
  /** the source text the places were read from (relation or pickup/delivery cells) */
  sourceText: string
  externalId: string
  pickup: PlaceGuess | null
  delivery: PlaceGuess | null
  ldmTenths: number | null
  weightKg: number | null
  description: string | null
  /** blocking: the row is not written while it has errors */
  errors: string[]
  /** informative: the row is written anyway */
  warnings: string[]
  excluded: boolean
  /** edited by hand in the preview */
  corrected: boolean
}

/** GET /imports/{id}/preview */
export interface ImportPreview {
  importId: number
  fileName: string
  rows: ImportRow[]
}

/** NOT IN SPEC v2: body of PUT /imports/{id}/rows/{rowNumber} (manual correction before commit) */
export interface ImportRowPatch {
  externalId?: string
  pickup?: PlaceGuess
  delivery?: PlaceGuess
  ldmTenths?: number
  excluded?: boolean
}

/** POST /imports/{id}/commit: valid, non-excluded rows are written, the rest skipped */
export interface ImportCommitResult {
  created: number
  skipped: number
  /**
   * NOT IN SPEC v2 (the backend does not send it): places looked up for coordinates while
   * committing, and the first error when a lookup failed.
   */
  geocoding?: { found: number; notFound: number; failed: number; message: string | null }
}

/** NOT IN SPEC v2: settings of the application on the device ("local" mode only) */
export interface DeviceSettings {
  /** look up the coordinates of new places with Nominatim when an import is committed */
  geocodingEnabled: boolean
  /** sent to Nominatim as `email`, so its operators can reach the user; null when not given */
  contactEmail: string | null
  /** OpenRouteService key made by the user, kept only on the device; null: great-circle distances */
  orsApiKey: string | null
  orsProfile: OrsProfile
}

/** NOT IN SPEC v2: OpenRouteService routing for trucks or for cars (question D3 is open) */
export type OrsProfile = 'driving-hgv' | 'driving-car'

/** NOT IN SPEC v2: where the distances of a result come from: road (ORS profile) or great-circle */
export type DistanceSource = OrsProfile | 'airline'

/** NOT IN SPEC v2: progress of the coordinate lookup while an import is committed */
export interface ImportCommitProgress {
  done: number
  total: number
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
