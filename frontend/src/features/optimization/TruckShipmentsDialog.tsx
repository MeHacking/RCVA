import { useEffect, useId, useRef } from 'react'
import { Icon } from '../../components/Icon'
import { formatShipmentCount } from '../../format/count'
import { formatKg, formatLdm } from '../../format/units'
import { MoveShipment, type Reassign } from './MoveShipment'
import type { TruckRow } from './resultRows'

/**
 * What a truck carries, with the relation of each shipment, in a modal window (a native
 * <dialog>: Escape closes it, focus stays inside and goes back to the button after).
 */
export function TruckShipmentsDialog({ row, onClose, reassign }: { row: TruckRow; onClose: () => void; reassign?: Reassign }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(event) => event.target === ref.current && ref.current.close()}
    >
      <div className="dialog__header">
        <h2 id={`${id}-title`}>
          {row.truckName}: {formatShipmentCount(row.shipments.length)}
        </h2>
        <button type="button" className="button--ghost dialog__x" onClick={() => ref.current?.close()} aria-label="Zatvori" title="Zatvori">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="table-wrap">
        <table className="table" aria-label={`Pošiljke: ${row.truckName}`}>
          <thead>
            <tr>
              <th scope="col">Pošiljka</th>
              <th scope="col">Relacija</th>
              <th scope="col" className="num">
                LDM
              </th>
              <th scope="col" className="num">
                Težina
              </th>
              {reassign && <th scope="col">Premesti</th>}
            </tr>
          </thead>
          <tbody>
            {row.shipments.map((shipment) => (
              <tr key={shipment.shipmentId}>
                <th scope="row">{shipment.label}</th>
                <td>
                  {shipment.pickupName} → {shipment.deliveryName}
                  {shipment.description && <span className="dialog__note">{shipment.description}</span>}
                </td>
                <td className="num">{shipment.ldmTenths === null ? '–' : formatLdm(shipment.ldmTenths)}</td>
                <td className="num">{shipment.weightKg === null ? '–' : `${formatKg(shipment.weightKg)} kg`}</td>
                {reassign && (
                  <td>
                    <MoveShipment reassign={reassign} shipmentId={shipment.shipmentId} label={shipment.label} truckId={row.truckId} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </dialog>
  )
}
