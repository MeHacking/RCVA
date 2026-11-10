import { useCallback } from 'react'
import { useApi } from '../../api/apiContext'
import { Notice } from '../../components/Notice'
import { useAsyncData } from '../../hooks/useAsyncData'
import { osmLink } from './osmLink'

/**
 * The places lorries do not reach, once the application could not move them itself to a point
 * they do: each with where it is on the map, for the user to choose another place.
 */
export function UnreachablePlaces({ placeIds }: { placeIds: number[] }) {
  const api = useApi()
  const load = useCallback(() => api.listLocations(), [api])
  const [locations] = useAsyncData(load)
  const places = locations.status === 'success' ? locations.data.filter((l) => placeIds.includes(l.id)) : []
  return (
    <Notice tone="info" title="Mesta do kojih nema puta za kamione" role="status">
      <p>
        Za ova mesta aplikacija nije našla tačku do koje kamion stiže u krugu od 10 km, ili ih je previše da bi problem bio
        u pojedinačnim mestima. U izmeni pošiljke upišite obližnje mesto.
      </p>
      <ul>
        {places.map((place) => (
          <li key={place.id}>
            {place.name}
            {place.lat !== null && place.lon !== null && (
              <>
                {' · '}
                <a href={osmLink({ lat: place.lat, lon: place.lon })} target="_blank" rel="noreferrer">
                  Gde je trenutna lokacija?
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </Notice>
  )
}
