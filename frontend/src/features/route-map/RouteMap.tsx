import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { OSM_ATTRIBUTION } from '../../api/local/nominatim'
import { Icon } from '../../components/Icon'
import type { MapModel, PlaceKind } from './mapModel'

// Leaflet directly (BSD-2-Clause; react-leaflet is not used, see CLAUDE.md). One map per
// mount, removed on unmount; the routes are redrawn into one layer group when the model
// changes. A route along the roads is a full line, a straight one is dashed. Marks are SVG
// circles, so no marker images are needed. Loaded lazily from RouteMapPage, so Leaflet is
// not in the main bundle.
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
  // The page builds a new model on every render; redraw only when it differs. Refit only
  // when the shown routes or places change, not when a road line arrives, so a pan or zoom
  // by the user stays.
  const signature = JSON.stringify(model)
  const fitted = useRef<string | null>(null)

  // Full screen: the browser's own (Esc leaves it), or, where there is none (some phones) or it
  // is refused, the map spread over the whole page.
  const frame = useRef<HTMLDivElement>(null)
  const [native, setNative] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const full = native || expanded

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement !== null && document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  // The map's box changed size: Leaflet measures it again (after the new layout), or tiles stay missing.
  useEffect(() => {
    const id = requestAnimationFrame(() => map.current?.map.invalidateSize())
    return () => cancelAnimationFrame(id)
  }, [full])

  async function toggleFullscreen() {
    const element = frame.current
    if (!element) return
    if (document.fullscreenElement) return document.exitFullscreen()
    if (expanded) return setExpanded(false)
    if (document.fullscreenEnabled) {
      try {
        return await element.requestFullscreen()
      } catch {
        // refused (e.g. not from a click): spread over the page instead
      }
    }
    setExpanded(true)
  }

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
      fitted.current = null
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
      L.polyline(route.path, {
        color: color(route.color),
        weight: 4,
        opacity: 0.85,
        dashArray: route.alongRoad ? undefined : '8 8',
        className: `map-route map-route--${route.alongRoad ? 'road' : 'straight'}`,
      })
        .bindTooltip(route.alongRoad ? route.truckName : `${route.truckName} (prava linija, ne put)`, { sticky: true })
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

    const shown = JSON.stringify([model.routes.map((r) => r.truckId), model.places.map((p) => p.at)])
    if (fitted.current === shown) return
    fitted.current = shown
    const points = [...model.routes.flatMap((r) => r.path), ...model.places.map((p) => p.at)]
    if (points.length > 0) leaflet.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 12 })
    else leaflet.setView([50, 15], 4)
  }, [signature])

  return (
    <div ref={frame} className={`route-map-frame${expanded ? ' route-map-frame--expanded' : ''}`}>
      <div
        ref={container}
        className="route-map"
        role="region"
        aria-label="Mapa ruta"
        data-testid="route-map"
        data-routes={model.routes.filter((r) => r.path.length >= 2).length}
        data-places={model.places.length}
        data-road-routes={model.routes.filter((r) => r.alongRoad).length}
      />
      <button
        type="button"
        className="route-map__fullscreen"
        onClick={() => void toggleFullscreen()}
        aria-pressed={full}
        title={full ? 'Izađi iz prikaza preko celog ekrana (Esc)' : 'Mapa preko celog ekrana'}
      >
        <Icon name={full ? 'collapse' : 'expand'} size={16} />
        <span className="visually-hidden">Ceo ekran</span>
      </button>
    </div>
  )
}

/** Names come from the user's files and go into tooltip HTML. */
function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
