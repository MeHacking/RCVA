import { formatKm, formatLdm } from '../../format/units'
import type { TruckRow } from './resultRows'

/**
 * Ordered stops of one route: base, pickups, deliveries and the return leg; an open route
 * has no base and no return, and nothing to drive before its first stop.
 */
export function StopList({ id, row }: { id: string; row: TruckRow }) {
  return (
    <ol id={id} className="stops" aria-label={`Stanice: ${row.truckName}`}>
      {!row.openRoute && (
        <li className="stops__item stops__item--base">
          <span className="stops__seq">0</span>
          <StopTag label="Baza" />
          <span className="stops__place">{row.baseName}</span>
          <span className="stops__meta" />
          <span className="stops__meta" />
        </li>
      )}
      {row.stops.map((stop, i) => (
        <li key={stop.sequence} className="stops__item">
          <span className="stops__seq">{stop.sequence}</span>
          {stop.type === 'PICKUP' ? (
            <StopTag label="Preuzimanje" modifier="pickup" />
          ) : (
            <StopTag label="Isporuka" modifier="delivery" />
          )}
          <span className="stops__place">
            {stop.locationName} <span className="text--muted">· {stop.shipmentLabel}</span>
          </span>
          <span className="stops__meta">{row.openRoute && i === 0 ? 'početak rute' : `+${formatKm(stop.legMeters)}`}</span>
          <span className="stops__meta">na kamionu {formatLdm(stop.loadAfterLdmTenths)} LDM</span>
        </li>
      ))}
      {!row.openRoute && (
        <li className="stops__item stops__item--base">
          <span className="stops__seq">↩</span>
          <StopTag label="Povratak" />
          <span className="stops__place">{row.baseName}</span>
          <span className="stops__meta">+{formatKm(row.returnLegMeters)}</span>
          <span className="stops__meta" />
        </li>
      )}
    </ol>
  )
}

/** Grid cell (keeps the row border) holding a compact tag. */
function StopTag({ label, modifier }: { label: string; modifier?: 'pickup' | 'delivery' }) {
  return (
    <span className="stops__type">
      <span className={modifier ? `tag tag--${modifier}` : 'tag'}>{label}</span>
    </span>
  )
}
