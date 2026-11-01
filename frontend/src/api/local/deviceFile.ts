import type { DeviceDataSummary } from '../types'
import type { LocalData, LocalJob } from './localClient'

// The data of the application on the device as one JSON file, for a backup and for moving
// to another device: everything the store keeps, with the format and its version, but never
// the ORS key. Reading checks the whole file first (format, version, the shape of every
// record, ids and references), so a bad file changes nothing.
//
// JSON has no Map, Set or Infinity: a job's fleet and added truck ids are written as arrays,
// and a job truck without a payload limit (capacityKg Infinity) as null.

export const DEVICE_FILE_FORMAT = 'rcva-podaci'
export const DEVICE_FILE_VERSION = 1

export class DeviceFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeviceFileError'
  }
}

export function deviceFileName(at: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `rcva-${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}.json`
}

export function writeDeviceFile(data: Required<LocalData>, exportedAt: Date): string {
  // Listed field by field, so a setting added later (or the key) never goes out by itself.
  const { geocodingEnabled, contactEmail, orsProfile } = data.settings
  return JSON.stringify({
    format: DEVICE_FILE_FORMAT,
    version: DEVICE_FILE_VERSION,
    exportedAt: exportedAt.toISOString(),
    data: {
      shipments: data.shipments,
      locations: data.locations,
      trucks: data.trucks,
      nextTruckId: data.nextTruckId,
      nextJobId: data.nextJobId,
      settings: { geocodingEnabled, contactEmail, orsProfile },
      geocodeCache: data.geocodeCache,
      distanceCache: data.distanceCache,
      routeLineCache: data.routeLineCache,
      jobs: data.jobs.map((job) => ({
        ...job,
        fleet: [...job.fleet.values()],
        addedTruckIds: [...job.addedTruckIds],
        input: {
          ...job.input,
          trucks: job.input.trucks.map((t) => ({ ...t, capacityKg: Number.isFinite(t.capacityKg) ? t.capacityKg : null })),
        },
      })),
    },
  })
}

/**
 * The data of a file and what it holds; throws DeviceFileError with the reason when the file
 * is not a data file of this application in a known version, or any part of it is broken.
 * The settings come without the ORS key.
 */
export function readDeviceFile(text: string): { data: LocalData; summary: DeviceDataSummary } {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    throw new DeviceFileError('Fajl nije JSON; izaberite fajl koji je napravilo „Izvezi podatke“.')
  }
  const top = file as { format?: unknown; version?: unknown } | null
  if (!isObject(top) || top.format !== DEVICE_FILE_FORMAT) {
    throw new DeviceFileError('Ovo nije fajl sa podacima aplikacije RCVA; izaberite fajl koji je napravilo „Izvezi podatke“.')
  }
  if (top.version !== DEVICE_FILE_VERSION) {
    throw new DeviceFileError(
      `Fajl je u formatu ${String(top.version)}, a aplikacija zna samo format ${DEVICE_FILE_VERSION}; ` +
        'možda ga je napravila novija verzija aplikacije.',
    )
  }
  FILE(file, 'fajl')
  const { exportedAt, data } = file as { exportedAt: string; data: FileData }
  checkReferences(data)

  const jobs: LocalJob[] = data.jobs.map((job) => ({
    ...job,
    fleet: new Map(job.fleet.map((t) => [t.id, t])),
    addedTruckIds: new Set(job.addedTruckIds),
    input: { ...job.input, trucks: job.input.trucks.map((t) => ({ ...t, capacityKg: t.capacityKg ?? Infinity })) },
  }))
  const localData: LocalData = { ...data, jobs, settings: { ...data.settings, orsApiKey: null } }
  return {
    data: localData,
    summary: {
      exportedAt,
      shipments: data.shipments.length,
      locations: data.locations.length,
      trucks: data.trucks.length,
      results: jobs.filter((j) => j.status === 'COMPLETED').length,
      geocodes: Object.keys(data.geocodeCache).length,
      distances: Object.keys(data.distanceCache).length,
      routeLines: Object.keys(data.routeLineCache).length,
    },
  }
}

// ---- The shape of the file: each check throws with the path of the first broken value. ----

type Check = (value: unknown, path: string) => void

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function broken(path: string, expected: string): never {
  throw new DeviceFileError(`Fajl je oštećen ili izmenjen: ${path} nije ${expected}.`)
}

const INT: Check = (v, p) => Number.isInteger(v) || broken(p, 'ceo broj')
const NUM: Check = (v, p) => (typeof v === 'number' && Number.isFinite(v)) || broken(p, 'broj')
const STR: Check = (v, p) => typeof v === 'string' || broken(p, 'tekst')
const BOOL: Check = (v, p) => typeof v === 'boolean' || broken(p, 'da/ne')
const nullable = (check: Check): Check => (v, p) => v === null || check(v, p)
const optional = (check: Check): Check => (v, p) => v === undefined || check(v, p)
const oneOf = (...values: unknown[]): Check => (v, p) => values.includes(v) || broken(p, `jedno od: ${values.join(', ')}`)
const arrayOf = (check: Check): Check => (v, p) => {
  if (!Array.isArray(v)) broken(p, 'spisak')
  v.forEach((item, i) => check(item, `${p}[${i}]`))
}
const recordOf = (check: Check): Check => (v, p) => {
  if (!isObject(v)) broken(p, 'skup vrednosti')
  for (const [key, item] of Object.entries(v)) check(item, `${p}["${key}"]`)
}
const object = (fields: Record<string, Check>): Check => (v, p) => {
  if (!isObject(v)) broken(p, 'objekat')
  for (const [name, check] of Object.entries(fields)) check(v[name], `${p}.${name}`)
}
const either = (a: Check, b: Check, expected: string): Check => (v, p) => {
  try {
    a(v, p)
  } catch {
    try {
      b(v, p)
    } catch {
      broken(p, expected)
    }
  }
}

const JOB_STATUS = oneOf('QUEUED', 'RUNNING', 'COMPLETED', 'INFEASIBLE', 'CANCELLED', 'FAILED')
const ORS_PROFILE = oneOf('driving-hgv', 'driving-car')
const DISTANCE_SOURCE = oneOf('driving-hgv', 'driving-car', 'airline')

const LOCATION = object({
  id: INT,
  name: STR,
  address: nullable(STR),
  country: nullable(STR),
  postalCode: nullable(STR),
  lat: nullable(NUM),
  lon: nullable(NUM),
  geocodeStatus: oneOf('OK', 'MANUAL', 'FAILED'),
})
const SHIPMENT = object({
  id: INT,
  externalId: STR,
  description: nullable(STR),
  ldmTenths: INT,
  pickupLocationId: INT,
  deliveryLocationId: INT,
  splittable: BOOL,
  weightKg: nullable(NUM),
  lengthMm: nullable(NUM),
  widthMm: nullable(NUM),
  heightMm: nullable(NUM),
})
const TRUCK = object({
  id: INT,
  name: STR,
  capacityLdmTenths: INT,
  capacityKg: nullable(NUM),
  available: BOOL,
  innerLengthMm: nullable(NUM),
  innerWidthMm: nullable(NUM),
  innerHeightMm: nullable(NUM),
})
const RESULT = object({
  status: JOB_STATUS,
  feasible: BOOL,
  trucksUsed: INT,
  trucksLowerBound: INT,
  totalMeters: NUM,
  routes: arrayOf(
    object({
      truckId: INT,
      usedLdmTenths: INT,
      totalMeters: NUM,
      stops: arrayOf(
        object({
          sequence: INT,
          type: oneOf('PICKUP', 'DELIVERY'),
          shipmentId: INT,
          locationId: INT,
          loadAfterLdmTenths: INT,
          legMeters: NUM,
        }),
      ),
    }),
  ),
  unassignedShipmentIds: arrayOf(INT),
  validation: object({ passed: BOOL, violations: arrayOf(STR) }),
  openRoute: optional(BOOL),
  distanceSource: optional(DISTANCE_SOURCE),
})
const JOB_INPUT = object({
  shipments: arrayOf(SHIPMENT),
  trucks: arrayOf(object({ id: INT, name: STR, capacityLdmTenths: INT, capacityKg: nullable(NUM) })),
  locationIds: arrayOf(INT),
  distance: arrayOf(arrayOf(NUM)),
  rules: object({ start: nullable(INT), end: nullable(INT), lifo: BOOL }),
})
const JOB = object({
  id: INT,
  status: JOB_STATUS,
  infeasibilityKind: nullable(oneOf('PROVEN', 'NOT_FOUND')),
  createdAt: STR,
  startedAt: nullable(STR),
  finishedAt: nullable(STR),
  timeLimitSeconds: NUM,
  score: nullable(object({ hard: NUM, medium: NUM, soft: NUM })),
  trucksLowerBound: nullable(INT),
  input: JOB_INPUT,
  fleet: arrayOf(TRUCK),
  addedTruckIds: arrayOf(INT),
  result: nullable(RESULT),
  distanceSource: optional(DISTANCE_SOURCE),
})
const POINT: Check = (v, p) =>
  (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) ||
  broken(p, 'tačka [lat, lon]')
const GEOCODE = either(
  object({ found: oneOf(true), lat: NUM, lon: NUM, label: STR }),
  object({ found: oneOf(false) }),
  'zapamćena koordinata',
)
const FILE = object({
  exportedAt: STR,
  data: object({
    shipments: arrayOf(SHIPMENT),
    locations: arrayOf(LOCATION),
    trucks: arrayOf(TRUCK),
    jobs: arrayOf(JOB),
    nextTruckId: INT,
    nextJobId: INT,
    settings: object({ geocodingEnabled: BOOL, contactEmail: nullable(STR), orsProfile: ORS_PROFILE }),
    geocodeCache: recordOf(GEOCODE),
    distanceCache: recordOf(nullable(NUM)),
    routeLineCache: recordOf(arrayOf(POINT)),
  }),
})

/** The file's data after the shape check: as LocalData, but with JSON's arrays and nulls. */
type FileJob = Omit<LocalJob, 'fleet' | 'addedTruckIds' | 'input'> & {
  fleet: LocalJob['fleet'] extends Map<number, infer T> ? T[] : never
  addedTruckIds: number[]
  input: Omit<LocalJob['input'], 'trucks'> & {
    trucks: Array<Omit<LocalJob['input']['trucks'][number], 'capacityKg'> & { capacityKg: number | null }>
  }
}
type FileData = Omit<Required<LocalData>, 'jobs' | 'settings'> & {
  jobs: FileJob[]
  settings: Omit<NonNullable<LocalData['settings']>, 'orsApiKey'>
}

/** What the shape check cannot see: unique ids, references, and counters past every id. */
function checkReferences(data: FileData): void {
  unique(data.shipments, 'pošiljka')
  unique(data.locations, 'mesto')
  unique(data.trucks, 'kamion')
  unique(data.jobs, 'posao')
  const places = new Set(data.locations.map((l) => l.id))
  for (const s of data.shipments) {
    for (const id of [s.pickupLocationId, s.deliveryLocationId]) {
      if (!places.has(id)) throw new DeviceFileError(`Fajl je oštećen ili izmenjen: pošiljka ${s.externalId} vodi do mesta ${id}, koje ne postoji.`)
    }
  }
  for (const job of data.jobs) {
    const n = job.input.locationIds.length
    if (job.input.distance.length !== n || job.input.distance.some((row) => row.length !== n)) {
      throw new DeviceFileError(`Fajl je oštećen ili izmenjen: rastojanja posla ${job.id} ne odgovaraju njegovim mestima.`)
    }
    if (job.status === 'COMPLETED' && !job.result) {
      throw new DeviceFileError(`Fajl je oštećen ili izmenjen: završeni posao ${job.id} nema rezultat.`)
    }
  }
  const truckIds = [...data.trucks, ...data.jobs.flatMap((j) => j.fleet)].map((t) => t.id)
  if (data.nextTruckId <= Math.max(0, ...truckIds) || data.nextJobId <= Math.max(0, ...data.jobs.map((j) => j.id))) {
    throw new DeviceFileError('Fajl je oštećen ili izmenjen: brojač id-jeva je manji od postojećeg id-ja.')
  }
}

function unique(items: Array<{ id: number }>, noun: string): void {
  const seen = new Set<number>()
  for (const { id } of items) {
    if (seen.has(id)) throw new DeviceFileError(`Fajl je oštećen ili izmenjen: ${noun} ${id} se ponavlja.`)
    seen.add(id)
  }
}
