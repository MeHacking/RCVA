// Storage of the application on the device (path B). The whole state is one snapshot,
// written after every change: the data is small (shipments, locations, trucks and the
// last jobs), and one record is never half written.
//
// IndexedDB keeps values with the structured clone algorithm, so Map, Set and Infinity
// (a truck without a payload limit in a job) are kept as they are.

/** The format of the snapshot; a stored snapshot of another version is never overwritten. */
export const DEVICE_DATA_VERSION = 1

export interface DeviceSnapshot<T> {
  version: typeof DEVICE_DATA_VERSION
  data: T
}

export interface DeviceStore<T> {
  /** null when nothing has been stored yet */
  load(): Promise<T | null>
  save(data: T): Promise<void>
}

export class DeviceStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DeviceStoreError'
  }
}

function unwrap<T>(snapshot: unknown): T | null {
  if (snapshot === undefined) return null
  const version = (snapshot as Partial<DeviceSnapshot<T>> | null)?.version
  if (version !== DEVICE_DATA_VERSION) {
    throw new DeviceStoreError(
      `Podaci na uređaju su u formatu ${String(version)}, a aplikacija zna samo format ${DEVICE_DATA_VERSION}.`,
    )
  }
  return (snapshot as DeviceSnapshot<T>).data
}

/** For tests: the snapshot is cloned on the way in and out, as IndexedDB does. */
export function createMemoryStore<T>(initial?: unknown): DeviceStore<T> & { snapshot(): unknown } {
  let stored: unknown = initial === undefined ? undefined : structuredClone(initial)
  return {
    load: async () => unwrap<T>(structuredClone(stored)),
    save: async (data) => {
      stored = structuredClone({ version: DEVICE_DATA_VERSION, data })
    },
    snapshot: () => structuredClone(stored),
  }
}

const OBJECT_STORE = 'app'
const KEY = 'data'

export function createIndexedDbStore<T>(databaseName = 'rcva'): DeviceStore<T> {
  let opened: Promise<IDBDatabase> | null = null

  function database(): Promise<IDBDatabase> {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new DeviceStoreError('Pregledač ne podržava čuvanje podataka na uređaju (IndexedDB).'))
        return
      }
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(OBJECT_STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(storeError('otvaranje', request.error))
      request.onblocked = () => reject(new DeviceStoreError('Baza na uređaju je zauzeta; zatvorite druge kartice aplikacije.'))
    })
    return opened
  }

  return {
    async load() {
      const db = await database()
      const value = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction(OBJECT_STORE, 'readonly').objectStore(OBJECT_STORE).get(KEY)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(storeError('čitanje', request.error))
      })
      return unwrap<T>(value)
    },

    async save(data) {
      const db = await database()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(OBJECT_STORE, 'readwrite')
        transaction.objectStore(OBJECT_STORE).put({ version: DEVICE_DATA_VERSION, data } satisfies DeviceSnapshot<T>, KEY)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(storeError('upis', transaction.error))
        transaction.onabort = () => reject(storeError('upis', transaction.error))
      })
    },
  }
}

function storeError(action: string, cause: DOMException | null): DeviceStoreError {
  return new DeviceStoreError(`Čuvanje na uređaju nije uspelo (${action}): ${cause?.message ?? 'nepoznata greška'}.`, {
    cause,
  })
}
