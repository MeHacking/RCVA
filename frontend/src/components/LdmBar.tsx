import { formatLdm, formatUtilization } from '../format/units'

/** Truck fill as a bar plus "used / capacity LDM · %". */
export function LdmBar({ usedLdmTenths, capacityLdmTenths }: { usedLdmTenths: number; capacityLdmTenths: number | null }) {
  if (capacityLdmTenths === null || capacityLdmTenths <= 0) {
    return <span>{formatLdm(usedLdmTenths)} LDM (kapacitet nepoznat)</span>
  }
  const percent = Math.round((usedLdmTenths / capacityLdmTenths) * 100)
  const over = usedLdmTenths > capacityLdmTenths
  const label = `${formatLdm(usedLdmTenths)} / ${formatLdm(capacityLdmTenths)} LDM · ${formatUtilization(usedLdmTenths, capacityLdmTenths)}`
  return (
    <div className="ldm-bar">
      <div
        className={`ldm-bar__track${over ? ' ldm-bar__track--over' : ''}`}
        role="meter"
        aria-label="Popunjenost"
        aria-valuemin={0}
        aria-valuemax={capacityLdmTenths}
        aria-valuenow={usedLdmTenths}
        aria-valuetext={label}
      >
        <div className="ldm-bar__fill" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="ldm-bar__label">{label}</span>
    </div>
  )
}
