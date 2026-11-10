import type { Location, OptimizationResult } from '../../api/types'
import { Notice } from '../../components/Notice'
import { haversineMeters } from '../../domain/optimization/distance'
import { formatKm } from '../../format/units'
import { osmLink } from './osmLink'

/** Nearer than this to where it was, a moved place is the same place for the driver. */
const WORTH_TELLING_M = 500

/** The places of the result lorries reach only at another point than the one found for the town. */
export function AccessPointsNotice({ result, locations }: { result: OptimizationResult; locations: Location[] }) {
  const stops = new Set(result.routes.flatMap((route) => route.stops.map((stop) => stop.locationId)))
  const moved = locations.flatMap((place) => {
    if (!stops.has(place.id) || !place.movedFrom || place.lat === null || place.lon === null) return []
    const point = { lat: place.lat, lon: place.lon }
    const meters = haversineMeters(place.movedFrom, point)
    return meters < WORTH_TELLING_M ? [] : [{ id: place.id, name: place.name, point, meters }]
  })
  if (moved.length === 0) return null
  return (
    <Notice tone="info" title="Kamion prilazi najbližoj tački do koje može" role="status">
      <p>Do ovih mesta nema puta za kamione, pa rute idu do najbliže tačke do koje kamion stiže.</p>
      <ul>
        {moved.map((place) => (
          <li key={place.id}>
            {place.name}: {formatKm(place.meters)} od izvorne tačke
            {' · '}
            <a href={osmLink(place.point)} target="_blank" rel="noreferrer">
              Gde kamion staje?
            </a>
          </li>
        ))}
      </ul>
    </Notice>
  )
}
