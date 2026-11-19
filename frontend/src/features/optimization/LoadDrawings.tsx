import type { LoadPlan } from '../../api/types'
import { obliqueDrawing, type CargoSpace } from './loadDrawing'

/**
 * The load of one truck for the PDF: a 3D view from the side, the blocks numbered from the
 * doors (1 is unloaded first). The numbers are in the shipments table too. (A view from above
 * was dropped 08.11.2026: the user found the 3D view enough.)
 */
export function LoadDrawings({ plan, space }: { plan: LoadPlan; space: CargoSpace }) {
  const oblique = obliqueDrawing(plan, space)
  return (
    <div className="load-drawings">
      <svg
        className="load-drawing load-drawing--3d"
        viewBox={oblique.viewBox}
        role="img"
        aria-label="Raspored tovara u 3D: prednji zid levo, vrata desno"
      >
        <polygon className="load-drawing__room" points={oblique.floor} />
        <polygon className="load-drawing__room" points={oblique.backWall} />
        <polygon className="load-drawing__room" points={oblique.frontWall} />
        {oblique.blocks.map((block, i) => (
          <g key={i} data-shipment={block.shipmentId}>
            <polygon className="load-drawing__block" points={block.front} fill={block.color} />
            <polygon className="load-drawing__block" points={block.top} fill={block.color} />
            <polygon className="load-drawing__light" points={block.top} />
            <polygon className="load-drawing__block" points={block.end} fill={block.color} />
            <polygon className="load-drawing__shade" points={block.end} />
          </g>
        ))}
        {/* One number per shipment, over every block (a shipment from smartLoad+ is many pieces). */}
        {oblique.labels.map((label) => (
          <text
            key={label.shipmentId}
            className="load-drawing__number"
            data-shipment={label.shipmentId}
            x={label.at[0]}
            y={label.at[1]}
            fontSize={oblique.fontSize * 1.3}
          >
            {label.number}
          </text>
        ))}
        <polyline className="load-drawing__edge" points={oblique.edges} />
        <text className="load-drawing__caption" x={oblique.frontLabelAt[0]} y={oblique.frontLabelAt[1]} fontSize={oblique.fontSize}>
          prednji zid
        </text>
        <text
          className="load-drawing__caption"
          x={oblique.doorsLabelAt[0]}
          y={oblique.doorsLabelAt[1]}
          fontSize={oblique.fontSize}
          textAnchor="end"
        >
          vrata
        </text>
      </svg>
    </div>
  )
}
