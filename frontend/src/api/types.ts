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
  /**
   * NOT IN SPEC v2 (only on the device): the place (location id, with coordinates) where the
   * truck is now, entered or confirmed by the user; a job's routes start here. Missing or
   * null: not known yet, so the truck cannot be used.
   */
  startLocationId?: number | null
  /**
   * NOT IN SPEC v2: the newest job when the location was set. The last delivery of a later
   * completed job is proposed as the new location, to be confirmed.
   */
  startSetAfterJobId?: number | null
}

/** Body of POST /trucks and PUT /trucks/{id}; the location is set with setTruckStart */
export type TruckInput = Omit<Truck, 'id' | 'startLocationId' | 'startSetAfterJobId'>

/**
 * NOT IN SPEC v2 (only on the device): a kind of truck the user adds trucks from, with the
 * measures a new truck gets. A truck does not remember its type: changing a type later
 * changes no truck. The standard curtain-sider is built in and is not one of these.
 */
export interface TruckType {
  id: number
  name: string
  capacityLdmTenths: number
  /** null = weight is not limited */
  capacityKg: number | null
  innerLengthMm: number | null
  innerWidthMm: number | null
  innerHeightMm: number | null
}

/** NOT IN SPEC v2: body of createTruckType and updateTruckType */
export type TruckTypeInput = Omit<TruckType, 'id'>

/** NOT IN SPEC v2: where a truck starts the next job, and the location proposed for it */
export interface TruckStart {
  truckId: number
  /** confirmed; null: not known yet */
  location: Location | null
  /** the truck's last delivery in a completed job newer than the confirmed location */
  proposal: { location: Location; jobId: number; finishedAt: string | null } | null
}

/**
 * NOT IN SPEC v2: a place typed by hand, the proposal of a job confirmed by the user, or the
 * location the truck has kept (the proposal is then no longer offered)
 */
export type TruckStartInput = { place: PlaceInput } | { proposalJobId: number } | { keep: true }

/** NOT IN SPEC v2: answer of setTruckStart; the location is set only when it has coordinates */
export interface TruckStartResult {
  truck: Truck
  /** what the lookup gave; `notFound` and `failed` leave the truck as it was */
  outcome: PlaceLookup['outcome']
  /** the place as typed (or proposed) */
  name: string
  /** why the lookup failed (`failed` only) */
  message: string | null
}

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
  /**
   * NOT IN SPEC v2 (only on the device): when the trucks are not enough, plan what fits and
   * list the rest as unassigned, instead of refusing (422) or ending NOT_FOUND.
   */
  allowUnassigned?: boolean
  /**
   * NOT IN SPEC v2: up to this many trucks may be used at no cost, so only the kilometres
   * decide between them (after the advice "one more truck, fewer kilometres"). Default 0.
   */
  freeTrucks?: number
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
  /**
   * NOT IN SPEC v2: where the truck starts (its location on the device); the first leg is
   * from here. Missing: from the base (Spec v2) or, with openRoute, from the first pickup.
   */
  startLocationId?: number
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
  /**
   * NOT IN SPEC v2 (only on the device): one more truck would save at least the share of
   * kilometres set in the settings. Missing: no such advice (or it was not looked for).
   */
  extraTruck?: ExtraTruckAdvice
}

/** NOT IN SPEC v2: the same shipments solved again with one truck more */
export interface ExtraTruckAdvice {
  trucksUsed: number
  totalMeters: number
  /** whole percent of the result's kilometres saved */
  savingPercent: number
  /**
   * the extra truck is a new one, counted as if it started at its first pickup (no empty
   * drive); false: one of the available trucks the result does not use
   */
  newTruck: boolean
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

/** NOT IN SPEC v2: a place of a shipment as corrected by hand after the import */
export interface PlaceInput extends PlaceGuess {
  /**
   * Coordinates entered by hand ("Ručno uneta lokacija"), used instead of a lookup; only
   * for a place that has none yet.
   */
  coordinates?: { lat: number; lon: number } | null
  /**
   * When this place replaces a place without coordinates, the other shipments at the
   * replaced place move here too. A place with coordinates is never replaced this way.
   */
  moveOtherShipments?: boolean
}

/** NOT IN SPEC v2: a correction of an imported shipment; fields left out stay as they are */
export interface ShipmentPatch {
  externalId?: string
  ldmTenths?: number
  weightKg?: number | null
  description?: string | null
  pickup?: PlaceInput
  delivery?: PlaceInput
}

/**
 * NOT IN SPEC v2: what happened to one place of an edited shipment. `known`: it already had
 * coordinates; `found` / `notFound` / `failed`: the lookup asked now (or its kept answer);
 * `manual`: coordinates entered by hand.
 */
export interface PlaceLookup {
  role: 'pickup' | 'delivery'
  name: string
  outcome: 'known' | 'found' | 'notFound' | 'failed' | 'manual'
  /** why the lookup failed (`failed` only) */
  message: string | null
}

/** NOT IN SPEC v2: answer of a shipment correction */
export interface ShipmentUpdateResult {
  shipment: Shipment
  /** other shipments moved to a new place (`PlaceInput.moveOtherShipments`) */
  movedShipments: number
  places: PlaceLookup[]
}

/** NOT IN SPEC v2: settings of the application on the device ("local" mode only) */
export interface DeviceSettings {
  /** look up the coordinates of new places with Nominatim when an import is committed or a shipment corrected */
  geocodingEnabled: boolean
  /** sent to Nominatim as `email`, so its operators can reach the user; null when not given */
  contactEmail: string | null
  /** OpenRouteService key made by the user, kept only on the device; null: great-circle distances */
  orsApiKey: string | null
  orsProfile: OrsProfile
  /**
   * After a job, solve again with one truck more and advise it when the kilometres fall by
   * at least this whole percent (1 to 99); null: never (the job then takes half as long).
   */
  extraTruckSavingPercent: number | null
}

/** NOT IN SPEC v2: OpenRouteService routing for trucks or for cars (question D3 is open) */
export type OrsProfile = 'driving-hgv' | 'driving-car'

/** NOT IN SPEC v2: where the distances of a result come from: road (ORS profile) or great-circle */
export type DistanceSource = OrsProfile | 'airline'

/** NOT IN SPEC v2: one route drawn along the roads, for the map */
export interface RouteLine {
  profile: OrsProfile
  /** [lat, lon] from the first stop to the last, simplified */
  path: Array<[number, number]>
}

/** NOT IN SPEC v2: all data of the application on the device as one file ("Izvezi podatke") */
export interface DeviceDataFile {
  fileName: string
  /** JSON; never holds the ORS key */
  content: string
}

/** NOT IN SPEC v2: what a data file holds, shown before it replaces the data on the device */
export interface DeviceDataSummary {
  /** ISO 8601 */
  exportedAt: string
  shipments: number
  locations: number
  trucks: number
  /** truck types the user added */
  truckTypes: number
  /** completed optimization jobs */
  results: number
  /** remembered coordinates, road distances and road lines */
  geocodes: number
  distances: number
  routeLines: number
}

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
  /**
   * NOT IN SPEC v2: with a 422 about the fleet, how many standard curtain-siders would at
   * least be needed besides the available trucks; missing when more trucks would not help
   */
  missingTrucks?: number
  /** field name -> message, for 400 validation errors */
  errors?: Record<string, string>
}
