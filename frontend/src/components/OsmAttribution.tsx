import { OSM_ATTRIBUTION } from '../api/local/nominatim'

/** Required wherever coordinates from Nominatim (OpenStreetMap data, ODbL) are used. */
export function OsmAttribution() {
  return (
    <span>
      Podaci o mestima:{' '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        {OSM_ATTRIBUTION}
      </a>
      .
    </span>
  )
}
