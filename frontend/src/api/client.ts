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
  PlaceSearchResult,
  RoadPointProposal,
  OptimizationJob,
  OptimizationJobCreated,
  OptimizationJobRequest,
  OptimizationResult,
  ProblemDetails,
  RouteLine,
  Shipment,
  ShipmentInput,
  ShipmentPatch,
  ShipmentUpdateResult,
  Truck,
  TruckInput,
  TruckStart,
  TruckStartInput,
  TruckStartResult,
  TruckType,
  TruckTypeInput,
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
  /**
   * NOT IN SPEC v2: gives the shipments whose ID an earlier import made from the file name and
   * the row ("Relacija-...-14") a short one by relation ("KRA-STE-1"; domain/shipmentIds).
   * Results show the new names at once (they keep shipment ids, not names). 404 over HTTP.
   */
  shortenShipmentIds(): Promise<{ renamed: number }>
  /**
   * NOT IN SPEC v2: corrects an imported shipment. Its places without coordinates are looked
   * up again (only these, and never a place whose answer is kept); a place keeps its name and
   * coordinates, so kept results do not change. 400 by field, 404 for an unknown shipment
   * (and over HTTP), 409 while a job waits or runs.
   */
  updateShipment(id: number, patch: ShipmentPatch): Promise<ShipmentUpdateResult>
  /**
   * NOT IN SPEC v2: a shipment entered by hand. Its places are found among the known ones or
   * looked up as at an import (or take coordinates given by hand); without an ID it gets a
   * short one by relation. 400 by field, 409 while a job waits or runs, 404 over HTTP.
   */
  createShipment(input: ShipmentInput): Promise<ShipmentUpdateResult>
  /**
   * NOT IN SPEC v2: removes one shipment, and its places when nothing uses them any more
   * (places of kept results stay). 404 for an unknown shipment (and over HTTP), 409 while a
   * job waits or runs.
   */
  deleteShipment(id: number): Promise<void>

  listTrucks(): Promise<Truck[]>
  createTruck(input: TruckInput): Promise<Truck>
  updateTruck(id: number, input: TruckInput): Promise<Truck>
  /** DELETE /trucks/{id} (204); 409 while an optimization job is queued or running */
  deleteTruck(id: number): Promise<void>
  /**
   * NOT IN SPEC v2: removes every truck, and gives them as they were, for "Poništi"
   * (restoreTrucks). 409 while a job waits or runs; 404 over HTTP.
   */
  deleteAllTrucks(): Promise<Truck[]>
  /**
   * NOT IN SPEC v2: puts removed trucks back as they were (ids and locations; a location whose
   * place is gone is dropped). 409 when one of the ids is taken again; 404 over HTTP.
   */
  restoreTrucks(trucks: Truck[]): Promise<Truck[]>
  /**
   * NOT IN SPEC v2: where every available truck starts the next job, with the location
   * proposed from its last delivery; null where trucks have no location (mock, backend).
   */
  getTruckStarts(): Promise<TruckStart[] | null>
  /**
   * NOT IN SPEC v2: sets where a truck is, from a place typed by hand (looked up like a
   * shipment's place; coordinates by hand allowed) or from a job's proposal. 400 by field,
   * 404, 409 while a job waits or runs (and for a proposal that no longer exists); 404 over
   * HTTP and in the mock.
   */
  setTruckStart(truckId: number, input: TruckStartInput): Promise<TruckStartResult>
  /**
   * NOT IN SPEC v2: the truck types the user added (without the built-in standard
   * curtain-sider), in the order they were added; null where there are none (backend).
   */
  listTruckTypes(): Promise<TruckType[] | null>
  /** NOT IN SPEC v2: 400 by field (also a name already used); 404 over HTTP */
  createTruckType(input: TruckTypeInput): Promise<TruckType>
  /** NOT IN SPEC v2: 400 by field, 404 for an unknown type (and over HTTP); no truck changes */
  updateTruckType(id: number, input: TruckTypeInput): Promise<TruckType>
  /** NOT IN SPEC v2: 404 for an unknown type (and over HTTP); trucks made from it stay */
  deleteTruckType(id: number): Promise<void>

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
  /**
   * NOT IN SPEC v2: when each optimization job was started (ISO 8601), oldest first, for the
   * dashboard. The device keeps them from 03.11.2026 on (and the jobs it had then); the mock
   * while the page lives; null over HTTP (the backend does not keep them).
   */
  getOptimizationHistory(): Promise<string[] | null>
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
  /**
   * NOT IN SPEC v2: the factory reset, everything on the device gone (the ORS key and the
   * settings too), as on the first start. 409 while a job waits or runs, 404 where there is no
   * data on the device.
   */
  resetDevice(): Promise<void>
  /**
   * NOT IN SPEC v2: for places no road for lorries reaches (noRoadPlaceIds of a 409 "Nema puta"),
   * the nearest point on a road the profile in the settings may use, within ROAD_POINT_RADIUS_M.
   * Changes nothing. 400 without an ORS key, 502 when ORS fails, 404 over HTTP and in the mock.
   */
  proposeRoadPoints(locationIds: number[]): Promise<RoadPointProposal[]>
  /**
   * NOT IN SPEC v2: moves a place to the point the user confirmed (a proposal's `to`); its
   * coordinates are then the user's (MANUAL), and where it was is kept in movedFrom (the first
   * place, if it is moved again). 400 for coordinates out of range, 404, 409 while a
   * job waits or runs; 404 over HTTP and in the mock.
   */
  moveToRoadPoint(locationId: number, to: { lat: number; lon: number }): Promise<Location>
  /**
   * NOT IN SPEC v2: puts a place moved to the nearest road back where it was (movedFrom). 409
   * when it was not moved or while a job waits or runs, 404; 404 over HTTP and in the mock.
   */
  restoreRoadPoint(locationId: number): Promise<Location>
  /**
   * NOT IN SPEC v2: looks a place up again by its name in the given country (null: everywhere),
   * whatever was answered before. Changes nothing on the place. 404, 409 when the lookup is off
   * in the settings, 502 when Nominatim fails; 404 over HTTP and in the mock.
   */
  searchPlaceAgain(locationId: number, country: string | null): Promise<PlaceSearchResult>
  /**
   * NOT IN SPEC v2: gives a place the coordinates and the country the user accepted from a new
   * search, for every shipment there. They are the user's from now on (MANUAL), and a kept move
   * to the road is dropped. 400 for coordinates out of range, 404, 409 while a job waits or
   * runs; 404 over HTTP and in the mock.
   */
  applyPlaceSearch(
    locationId: number,
    found: { lat: number; lon: number; label: string; country: string | null },
  ): Promise<Location>
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
