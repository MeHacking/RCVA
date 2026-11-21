import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { OSM_ATTRIBUTION } from '../../api/local/nominatim'
import { pinLabel, type TruckMapModel, type TruckPin } from './truckMapModel'

// Leaflet directly, as the route map (RouteMap.tsx): one map per mount, the pins redrawn into one
// layer group when the model changes; loaded lazily from the Kamioni screen. Tiles from the
// OpenStreetMap tile server under its usage policy, the attribution always shown.

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
// A pin 28 × 38 px whose point is at the place; its colours are in layout.css (.truck-pin).
const PIN_PATH = 'M14 1C6.8 1 1.5 6.6 1.5 13.4 1.5 22.6 14 37 14 37s12.5-14.4 12.5-23.6C26.5 6.6 21.2 1 14 1Z'

export default function TruckMap({ model }: { model: TruckMapModel }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<{ map: L.Map; layers: L.LayerGroup } | null>(null)
  const signature = JSON.stringify(model.pins)

  useEffect(() => {
    const element = container.current
    if (!element) return
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
    if (!current) return
    const { map: leaflet, layers } = current
    const pins = JSON.parse(signature) as TruckPin[]
    layers.clearLayers()
    // The view first: Leaflet makes a marker's element only once the map has one.
    if (pins.length > 0) leaflet.fitBounds(L.latLngBounds(pins.map((p) => p.at)), { padding: [40, 40], maxZoom: 10 })
    else leaflet.setView([50, 15], 4)
    for (const pin of pins) {
      const count = pin.trucks.length
      const idle = pin.trucks.every((t) => !t.available)
      const mark = count > 1 ? `<text x="14" y="18">${count}</text>` : '<circle cx="14" cy="13.5" r="4.5" />'
      const icon = L.divIcon({
        className: `truck-pin truck-pin--${pin.kind}${idle ? ' truck-pin--idle' : ''}`,
        html: `<svg viewBox="0 0 28 38" width="28" height="38" aria-hidden="true"><path d="${PIN_PATH}" />${mark}</svg>`,
        iconSize: [28, 38],
        iconAnchor: [14, 37],
        tooltipAnchor: [0, -30],
      })
      const label = pinLabel(pin)
      const marker = L.marker(pin.at, { icon, keyboard: true, zIndexOffset: pin.kind === 'proposal' ? 100 : 0 })
        .bindTooltip(
          `<strong>${escape(pin.placeName)}</strong>${pin.kind === 'proposal' ? ' (predlog posle optimizacije)' : ''}<br>` +
            pin.trucks.map((t) => escape(t.available ? t.name : `${t.name} (nije dostupan)`)).join('<br>'),
          { direction: 'top' },
        )
        .addTo(layers)
      const element = marker.getElement()
      element?.setAttribute('aria-label', label)
      element?.setAttribute('data-kind', pin.kind)
    }
  }, [signature])

  return (
    <div
      ref={container}
      className="route-map truck-map"
      role="region"
      aria-label="Mapa kamiona"
      data-testid="truck-map"
      data-pins={model.pins.length}
    />
  )
}

/** Names come from the user's data and go into tooltip HTML. */
function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
