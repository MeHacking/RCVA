import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { LdmBar } from '../../components/LdmBar'
import { formatKm } from '../../format/units'
import type { TruckRow } from './resultRows'
import { StopList } from './StopList'

const COLUMNS = 6

export function RouteTable({ jobId, rows }: { jobId: number; rows: TruckRow[] }) {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set())

  const toggle = (truckId: number) =>
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(truckId)) next.delete(truckId)
      else next.add(truckId)
      return next
    })

  return (
    <div className="table-wrap">
      <table className="table route-table" aria-label="Kamioni i rute">
        <thead>
          <tr>
            <th scope="col">Kamion</th>
            <th scope="col">Pošiljke</th>
            <th scope="col">Popunjenost</th>
            <th scope="col" className="num">
              Kilometraža
            </th>
            <th scope="col">Redosled stanica</th>
            <th scope="col">
              <span className="visually-hidden">Linkovi</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = expanded.has(row.truckId)
            const stopsId = `stops-${row.truckId}`
            const query = `?job=${jobId}&truck=${row.truckId}`
            return (
              <Fragment key={row.truckId}>
                <tr>
                  <th scope="row">{row.truckName}</th>
                  <td className="route-table__shipments">{row.shipmentLabels.join(', ')}</td>
                  <td>
                    <LdmBar usedLdmTenths={row.usedLdmTenths} capacityLdmTenths={row.capacityLdmTenths} />
                  </td>
                  <td className="num">{formatKm(row.totalMeters)}</td>
                  <td>
                    <button
                      type="button"
                      className="button--small button--ghost disclosure"
                      aria-expanded={open}
                      aria-controls={stopsId}
                      onClick={() => toggle(row.truckId)}
                    >
                      <Icon name="chevron" size={14} />
                      Stanice ({row.stops.length})
                    </button>
                  </td>
                  <td className="actions route-table__links">
                    <Link to={`/truck-3d${query}`}>3D prikaz</Link>
                    <Link to={`/route-map${query}`}>Mapa</Link>
                  </td>
                </tr>
                {open && (
                  <tr className="route-table__detail">
                    <td colSpan={COLUMNS}>
                      <StopList id={stopsId} row={row} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
