/**
 * A message that survives the page's reload after all data on the device was replaced (an
 * import of a data file, the factory reset), so the settings can say what happened.
 */
const KEY = 'rcva-imported'

export function keepForReload(message: string): void {
  storage((s) => s.setItem(KEY, message))
}

export function readAfterReload(): string | null {
  return storage((s) => s.getItem(KEY))
}

export function clearAfterReload(): void {
  storage((s) => s.removeItem(KEY))
}

/** sessionStorage may be blocked; the message is only a convenience. */
function storage<T>(act: (s: Storage) => T): T | null {
  try {
    return act(sessionStorage)
  } catch {
    return null
  }
}
