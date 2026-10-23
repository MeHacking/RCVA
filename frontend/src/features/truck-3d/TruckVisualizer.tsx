import { useEffect, useRef, useState } from 'react'
import type { LoadPlanMode, Placement } from '../../api/types'
import { Badge } from '../../components/Badge'
import { ErrorState } from '../../components/states'
import { loadTego } from './tego/loadTego'
import {
  BIN_MAPPING,
  HIGHLIGHT_COLOR,
  toViewerBin,
  toViewerItems,
  VIEWER_MAPPING,
  type CargoSpaceMm,
  type ViewerItem,
} from './tego/tegoAdapter'
import type { PackWidgetInstance } from './tego/tegoTypes'

/** Contract from Spec v2, section 7. */
export interface TruckVisualizerProps {
  truck: CargoSpaceMm
  placements: Placement[]
  mode: LoadPlanMode
  selectedShipmentId?: number | null
  onSelect?: (shipmentId: number | null) => void
}

/**
 * Thin React wrapper around TeGo's imperative PackWidget. The widget is created in an
 * effect (never during render) and destroyed in its cleanup. Remount with a `key` when
 * the truck changes. TeGo draws into one shared full-screen canvas behind the page, so
 * this container and its ancestors must stay transparent (decision "A", Spec v2 section 2).
 */
export function TruckVisualizer({ truck, placements, mode, selectedShipmentId = null, onSelect }: TruckVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<PackWidgetInstance<ViewerItem> | null>(null)
  const onSelectRef = useRef(onSelect)
  const [state, setState] = useState<{ status: 'loading' | 'ready' } | { status: 'error'; message: string }>({
    status: 'loading',
  })
  const [hoveredShipmentId, setHoveredShipmentId] = useState<number | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
  })

  const { innerLengthMm, innerWidthMm, innerHeightMm } = truck
  useEffect(() => {
    let cancelled = false
    let widget: PackWidgetInstance<ViewerItem> | null = null

    loadTego().then(
      (tego) => {
        const container = containerRef.current
        if (cancelled || !container) return
        const bins = tego.mapBins([toViewerBin({ innerLengthMm, innerWidthMm, innerHeightMm })], BIN_MAPPING)
        const items = tego.mapItems(toViewerItems(placements), VIEWER_MAPPING)
        widget = new tego.PackWidget(bins, items, {
          cameraType: 'perspective',
          horizontalRotation: true,
          verticalRotation: true,
          border: 40,
          enableItemDrag: false, // TeGo's edit mode is out of the MVP
        })
        widget.onItemOver = (item) => setHoveredShipmentId(item?.dataItem.shipmentId ?? null)
        widget.onItemOut = () => setHoveredShipmentId(null)
        widget.onItemClick = (item) => onSelectRef.current?.(item?.dataItem.shipmentId ?? null)
        widget.create(container)
        widgetRef.current = widget
        setState({ status: 'ready' })
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )

    return () => {
      cancelled = true
      widgetRef.current = null
      // destroy() exists only in the RCVA-modified packwidget.js (see public/legacy/tego/NOTICE).
      widget?.destroy?.()
    }
  }, [innerLengthMm, innerWidthMm, innerHeightMm, placements])

  // Highlight the selected and the hovered shipment; the others keep their color.
  useEffect(() => {
    const widget = widgetRef.current
    if (!widget || state.status !== 'ready') return
    for (const item of widget.itemMap.values()) {
      const id = item.dataItem.shipmentId
      item.graphicsItem.material.color.set(id === selectedShipmentId || id === hoveredShipmentId ? HIGHLIGHT_COLOR : item.color)
    }
  }, [selectedShipmentId, hoveredShipmentId, state.status])

  return (
    <div className="truck-visualizer">
      {mode === 'ILLUSTRATIVE_LDM' && (
        <p className="truck-visualizer__label">
          <Badge tone="warning">Ilustrativni raspored</Badge>
          <span className="text--muted">Dužina blokova prati LDM; ovo nije stvarni raspored robe.</span>
        </p>
      )}
      {state.status === 'error' ? (
        <ErrorState title="3D prikaz nije dostupan" message={state.message} />
      ) : (
        <div
          ref={containerRef}
          className="truck-visualizer__viewport"
          data-testid="truck-visualizer"
          data-state={state.status}
          role="img"
          aria-label={`3D prikaz tovarnog prostora sa ${placements.length} pošiljki`}
        >
          {state.status === 'loading' && <span className="truck-visualizer__loading">Učitavanje 3D prikaza…</span>}
        </div>
      )}
    </div>
  )
}
