import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LoadPlanMode, Placement } from '../../api/types'
import { Badge } from '../../components/Badge'
import { Icon } from '../../components/Icon'
import { formatShipmentCount } from '../../format/count'
import { useFullscreen } from '../../hooks/useFullscreen'
import { piecesFromPlan, spaceOf, type CargoSpaceMm, type ViewName } from './scene'
import { ViewIcon } from './viewIcons'

// three.js is a part of the bundle of its own, loaded when the 3D screen opens.
const Truck3D = lazy(() => import('./Truck3D').then((m) => ({ default: m.Truck3D })))

const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'iso', label: 'Ukoso' },
  { id: 'top', label: 'Odozgo' },
  { id: 'side', label: 'Sa strane' },
  { id: 'back', label: 'Od vrata' },
]

const HINT = 'Prevucite mišem da okrenete, točkićem približite, desnim tasterom pomerite. Klik na pošiljku pokazuje koja je.'

/** Contract from Spec v2, section 7 (with `selectedInfo`, the line under the view). */
export interface TruckVisualizerProps {
  truck: CargoSpaceMm
  placements: Placement[]
  mode: LoadPlanMode
  selectedShipmentId?: number | null
  onSelect?: (shipmentId: number | null) => void
  /** what the chosen shipment is; without a choice the line says how to use the view */
  selectedInfo?: ReactNode
  /** NOT IN SPEC v2: "Uredi", left of "Ceo ekran", opens the editor (only on the device) */
  onEdit?: () => void
}

/**
 * The 3D view card (as in smartLoad): the views, full screen, the picture and a line about the
 * chosen shipment. Remount with a `key` when the truck changes.
 */
export function TruckVisualizer({ truck, placements, mode, selectedShipmentId = null, onSelect, selectedInfo, onEdit }: TruckVisualizerProps) {
  const pieces = useMemo(() => piecesFromPlan(placements), [placements])
  const { innerLengthMm, innerWidthMm, innerHeightMm } = truck
  const space = useMemo(
    () => spaceOf({ innerLengthMm, innerWidthMm, innerHeightMm }),
    [innerLengthMm, innerWidthMm, innerHeightMm],
  )
  const [view, setView] = useState<ViewName>('iso')
  const [viewTick, setViewTick] = useState(0)
  const frame = useRef<HTMLElement>(null)
  const { full, expanded, toggle } = useFullscreen(frame)

  return (
    <section ref={frame} className={`panel truck-view${expanded ? ' truck-view--expanded' : ''}`} aria-label="3D prikaz">
      <div className="truck-view__bar">
        <div className="view-switch" role="group" aria-label="Pogled">
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => {
                setView(id)
                setViewTick((t) => t + 1)
              }}
            >
              <ViewIcon view={id} />
              {label}
            </button>
          ))}
        </div>
        <span className="truck-view__actions">
          {onEdit && (
            <button
              type="button"
              title="Pomerajte i okrećite pošiljke u 2D i 3D prikazu"
              onClick={() => {
                // The editor replaces this card: leave the full screen first.
                if (full || expanded) void toggle()
                onEdit()
              }}
            >
              <Icon name="edit" />
              Uredi
            </button>
          )}
          <button
            type="button"
            className="truck-view__fullscreen"
            title={full ? 'Izađi iz prikaza preko celog ekrana (Esc)' : '3D prikaz preko celog ekrana'}
            onClick={() => void toggle()}
          >
            <Icon name={full ? 'collapse' : 'expand'} />
            {/* As in smartLoad (20.11.2026): in full screen the button says "Normalan prikaz". */}
            {full ? 'Normalan prikaz' : 'Ceo ekran'}
          </button>
        </span>
      </div>
      {mode === 'ILLUSTRATIVE_LDM' && (
        <p className="truck-view__label">
          <Badge tone="warning">Ilustrativni raspored</Badge>
          <span className="text--muted">Dužina blokova prati LDM; ovo nije stvarni raspored robe.</span>
        </p>
      )}
      <div className="truck-view__stage">
        <Suspense fallback={<div className="truck3d" role="img" aria-label="3D prikaz se učitava" />}>
          <Truck3D
            pieces={pieces}
            space={space}
            selected={selectedShipmentId}
            // Here a click picks the whole shipment, also on one of its packages from smartLoad+
            // (the list beside it and the import are by shipment); the editor moves packages one by one.
            onSelect={(hit) => onSelect?.(hit?.shipmentId ?? null)}
            view={view}
            viewTick={viewTick}
            // A shipment from smartLoad+ is many pieces.
            label={`3D prikaz kamiona: ${formatShipmentCount(new Set(placements.map((p) => p.shipmentId)).size)} u tovarnom prostoru`}
          />
        </Suspense>
      </div>
      <p className="truck-view__info" aria-live="polite">
        {selectedInfo ?? <span className="text--muted">{HINT}</span>}
      </p>
    </section>
  )
}
