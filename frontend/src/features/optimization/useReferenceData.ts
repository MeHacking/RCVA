import { useCallback } from 'react'
import { useApi } from '../../api/apiContext'
import { useAsyncData } from '../../hooks/useAsyncData'
import type { ReferenceData } from './resultRows'

/** Trucks, shipments, locations and base, needed to show a result with readable names. */
export function useReferenceData() {
  const api = useApi()
  const load = useCallback(async (): Promise<ReferenceData> => {
    const [trucks, shipments, locations, base] = await Promise.all([
      api.listTrucks(),
      api.listShipments(),
      api.listLocations(),
      api.getBase(),
    ])
    return { trucks, shipments, locations, base }
  }, [api])
  return useAsyncData(load)
}
