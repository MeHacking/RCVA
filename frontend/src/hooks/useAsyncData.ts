import { useCallback, useEffect, useState } from 'react'
import { describeError } from '../api/client'

export type AsyncData<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T }

/**
 * Loads data once per `load` identity (wrap it in useCallback). `reload()` keeps showing
 * the current data until fresh data arrives; after an error it shows loading again.
 * Responses that arrive after unmount (e.g. the StrictMode double mount) are ignored.
 */
export function useAsyncData<T>(load: () => Promise<T>): [AsyncData<T>, () => void] {
  const [state, setState] = useState<AsyncData<T>>({ status: 'loading' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setState({ status: 'success', data })
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: describeError(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [load, version])

  const reload = useCallback(() => {
    setState((previous) => (previous.status === 'error' ? { status: 'loading' } : previous))
    setVersion((v) => v + 1)
  }, [])

  return [state, reload]
}
