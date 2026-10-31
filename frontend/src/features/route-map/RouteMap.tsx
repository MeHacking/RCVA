import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { OSM_ATTRIBUTION } from '../../api/local/nominatim'
import type { MapModel, PlaceKind } from './mapModel'

// Leaflet directly (BSD-2-Clause; react-leaflet is not used, see CLAUDE.md). One map per
// mount, removed on unmount; the routes are redrawn into one layer group when the model
// changes. Marks are SVG circles, so no marker images are needed. Loaded lazily from
// RouteMapPage, so Leaflet is not in the main bundle.
//
// Map tiles come from the OpenStreetMap tile server, under its usage policy
// (https://operations.osmfoundation.org/policies/tiles/): the browser's Referer
// identifies the application, the attribution is always shown, no prefetching.

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const KIND_LABELS: Record<PlaceKind, string> = {
  pickup: 'preuzimanje',
  delivery: 'isporuka',
  both: 'preuzimanje i isporuka',
  base: 'baza',
}

export default function RouteMap({ model }: { model: MapModel }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<{ map: L.Map; layers: L.LayerGroup } | null>(null)
  // The page builds a new model on every render; redraw (and refit) only when it differs,
  // so a pan or zoom by the user stays until the routes change.
  const signature = JSON.stringify(model)

  useEffect(() => {
    const element = container.current
    if (!element) return
    // Whole zoom steps: no seams between tiles (see .route-map in layout.css).
    const created = L.map(element)
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">${OSM_ATTRIBUTION}</a>`,
    }).addTo(created)
    created.attributionControl.setPrefix(false)
    map.current = { map: created, layers: L.layerGroup().addTo(created) }
    return () => {
      created.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const current = map.current
    const element = container.current
    if (!current || !element) return
    const { map: leaflet, layers } = current
    const model = JSON.parse(signature) as MapModel
    layers.clearLayers()
    const color = (n: number) => getComputedStyle(element).getPropertyValue(`--route-${n}`).trim()

    for (const route of model.routes) {
      if (route.path.length < 2) continue
      L.polyline(route.path, { color: color(route.color), weight: 4, opacity: 0.85, className: 'map-route' })
        .bindTooltip(route.truckName, { sticky: true })
        .addTo(layers)
    }
    for (const place of model.places) {
      const stroke = color(place.color)
      L.circleMarker(place.at, {
        radius: place.kind === 'base' ? 8 : 6,
        color: place.kind === 'base' ? getComputedStyle(element).getPropertyValue('--dark-grey').trim() : stroke,
        weight: 2,
        // Pickups are filled, deliveries open; a place with both is half filled.
        fillColor: place.kind === 'delivery' ? getComputedStyle(element).getPropertyValue('--cream-light').trim() : stroke,
        fillOpacity: place.kind === 'both' ? 0.5 : 1,
        className: `map-place map-place--${place.kind}`,
      })
        .bindTooltip(`<strong>${escape(place.name)}</strong> (${KIND_LABELS[place.kind]})<br>${place.visits.map(escape).join('<br>')}`)
        .addTo(layers)
    }

    const points = [...model.routes.flatMap((r) => r.path), ...model.places.map((p) => p.at)]
    if (points.length > 0) leaflet.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 12 })
    else leaflet.setView([50, 15], 4)
  }, [signature])

  return (
    <div
      ref={container}
      className="route-map"
      role="region"
      aria-label="Mapa ruta"
      data-testid="route-map"
      data-routes={model.routes.filter((r) => r.path.length >= 2).length}
      data-places={model.places.length}
    />
  )
}

/** Names come from the user's files and go into tooltip HTML. */
function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
