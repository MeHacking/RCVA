import type { ShipmentStatus } from '../shipments/shipmentRows'
import { SHIPMENT_STATUS_LABELS } from '../shipments/shipmentRows'
import { Icon, type IconName } from '../../components/Icon'
import { loadLevel } from './dashboardModel'

// Small charts for the dashboard, drawn with SVG and CSS (no chart library). Every value is
// written next to its mark, so the colors and the hover titles only add to the text.

/** A load against its limit: a track with a fill whose color says how full it is. */
export function Meter({
  label,
  used,
  capacity,
  format,
  compact = false,
}: {
  label: string
  used: number
  capacity: number
  /** a value with its unit, e.g. "20,9 LDM" */
  format: (value: number) => string
  /** one line, for a row of a table-like list */
  compact?: boolean
}) {
  const level = loadLevel(used, capacity)
  const share = capacity > 0 ? used / capacity : 0
  const percent = Math.round(share * 100)
  const text = `${format(used)} od ${format(capacity)} · ${percent} %`
  return (
    <div className={`meter meter--${level}${compact ? ' meter--compact' : ''}`}>
      {!compact && (
        <div className="meter__head">
          <span className="meter__label">{label}</span>
          <span className="meter__value">{text}</span>
        </div>
      )}
      <div
        className="meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={used}
        aria-valuetext={text}
        title={`${label}: ${text}`}
      >
        <div className="meter__fill" style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
      {compact && <span className="meter__value">{text}</span>}
      {level === 'over' && !compact && (
        <p className="meter__note">
          <Icon name="alert" size={14} /> Više od kapaciteta za {format(used - capacity)}.
        </p>
      )}
    </div>
  )
}

const STATUS_ORDER: ShipmentStatus[] = ['OK', 'MANUAL', 'LOCATION_ERROR']
const STATUS_ICONS: Record<ShipmentStatus, IconName> = { OK: 'check', MANUAL: 'pin', LOCATION_ERROR: 'alert' }

/**
 * The shipments by status as a ring, with the total in the middle and a legend with the
 * counts (the legend, not the color, names each part).
 */
export function StatusRing({ counts }: { counts: Record<ShipmentStatus, number> }) {
  const total = STATUS_ORDER.reduce((sum, s) => sum + counts[s], 0)
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const shown = STATUS_ORDER.filter((s) => counts[s] > 0)
  // A 2px gap in the surface color between parts; none when one part is the whole ring.
  const gap = shown.length > 1 ? 2 : 0
  // Each part starts where the ones before it end.
  const lengths = shown.map((s) => (counts[s] / total) * circumference)
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((sum, l) => sum + l, 0))
  return (
    <div className="status-ring">
      <svg className="status-ring__chart" viewBox="0 0 100 100" role="img" aria-label={ringLabel(counts, total)}>
        <circle className="status-ring__track" cx="50" cy="50" r={radius} />
        {/* From twelve o'clock, clockwise. */}
        <g transform="rotate(-90 50 50)">
          {shown.map((status, i) => (
            <circle
              key={status}
              className={`status-ring__part status-ring__part--${status.toLowerCase()}`}
              cx="50"
              cy="50"
              r={radius}
              strokeDasharray={`${Math.max(0, lengths[i] - gap)} ${circumference}`}
              strokeDashoffset={-starts[i]}
            >
              <title>{`${SHIPMENT_STATUS_LABELS[status]}: ${counts[status]}`}</title>
            </circle>
          ))}
        </g>
        <text className="status-ring__total" x="50" y="50">
          {total}
        </text>
        <text className="status-ring__unit" x="50" y="64">
          pošiljki
        </text>
      </svg>
      <ul className="status-ring__legend">
        {STATUS_ORDER.map((status) => (
          <li key={status} className={`status-ring__item status-ring__item--${status.toLowerCase()}`}>
            <span className="status-ring__key" aria-hidden="true">
              <Icon name={STATUS_ICONS[status]} size={14} />
            </span>
            <span>{SHIPMENT_STATUS_LABELS[status]}</span>
            <strong>{counts[status]}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ringLabel(counts: Record<ShipmentStatus, number>, total: number): string {
  return `Pošiljke po statusu, ukupno ${total}: ${STATUS_ORDER.map((s) => `${SHIPMENT_STATUS_LABELS[s]} ${counts[s]}`).join(', ')}`
}

/** Horizontal bars from one baseline, longest first, each with its name and value. */
export function BarList({
  label,
  items,
}: {
  /** names the list for assistive technology */
  label: string
  items: Array<{ key: string | number; name: string; value: number; text: string; swatch?: number }>
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="bar-list" aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className="bar-list__item" title={`${item.name}: ${item.text}`}>
          <span className="bar-list__name">
            {item.swatch !== undefined && (
              <span className="route-swatch" style={{ background: `var(--route-${item.swatch})` }} aria-hidden="true" />
            )}
            {item.name}
          </span>
          <span className="bar-list__bar" aria-hidden="true">
            <span className="bar-list__fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="bar-list__value">{item.text}</span>
        </li>
      ))}
    </ul>
  )
}
