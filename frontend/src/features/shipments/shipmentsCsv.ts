import { toCsv } from '../../format/csv'
import { formatLdm } from '../../format/units'
import { SHIPMENT_STATUS_LABELS, type ShipmentRow } from './shipmentRows'

const HEADER = [
  'ID',
  'Preuzimanje',
  'Isporuka',
  'Poštanski broj isporuke',
  'LDM',
  'Težina (kg)',
  'Dužina (mm)',
  'Širina (mm)',
  'Visina (mm)',
  'Status',
]

/** Same columns as the table; numbers as plain values (LDM with a decimal comma). */
export function shipmentsToCsv(rows: ShipmentRow[]): string {
  return toCsv(
    HEADER,
    rows.map((row) => [
      row.externalId,
      row.pickupName,
      row.deliveryName,
      row.deliveryPostalCode,
      formatLdm(row.ldmTenths),
      row.weightKg,
      row.lengthMm,
      row.widthMm,
      row.heightMm,
      SHIPMENT_STATUS_LABELS[row.status],
    ]),
  )
}

/** "posiljke-2026-10-23.csv" (local date) */
export function shipmentsCsvFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `posiljke-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`
}
