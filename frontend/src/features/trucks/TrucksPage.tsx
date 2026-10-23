import { useCallback, useState } from 'react'
import { useApi } from '../../api/apiContext'
import type { Truck } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatDimensionsMm, formatLdm } from '../../format/units'
import { useAsyncData } from '../../hooks/useAsyncData'
import { TruckForm } from './TruckForm'

type Editing = { mode: 'create' } | { mode: 'edit'; truck: Truck } | null

export function TrucksPage() {
  const api = useApi()
  const load = useCallback(() => api.listTrucks(), [api])
  const [trucks, reload] = useAsyncData(load)
  const [editing, setEditing] = useState<Editing>(null)

  const handleSaved = () => {
    setEditing(null)
    reload()
  }

  return (
    <section>
      <PageHeader
        title="Kamioni"
        actions={
          <button type="button" onClick={() => setEditing({ mode: 'create' })} disabled={trucks.status !== 'success'}>
            Dodaj kamion
          </button>
        }
      />

      {editing && (
        <TruckForm
          key={editing.mode === 'edit' ? editing.truck.id : 'new'}
          truck={editing.mode === 'edit' ? editing.truck : null}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      {trucks.status === 'loading' && <LoadingState label="Učitavanje kamiona…" />}
      {trucks.status === 'error' && (
        <ErrorState title="Kamioni nisu učitani" message={trucks.message} onRetry={reload} />
      )}
      {trucks.status === 'success' &&
        (trucks.data.length === 0 ? (
          <EmptyState title="Nema unetih kamiona">
            Dodajte prvi kamion dugmetom „Dodaj kamion“. Za optimizaciju je dovoljan naziv i kapacitet u
            LDM; dimenzije tovarnog prostora su potrebne samo za 3D prikaz.
          </EmptyState>
        ) : (
          <TruckTable
            trucks={trucks.data}
            editingId={editing?.mode === 'edit' ? editing.truck.id : null}
            onEdit={(truck) => setEditing({ mode: 'edit', truck })}
          />
        ))}
    </section>
  )
}

function TruckTable({
  trucks,
  editingId,
  onEdit,
}: {
  trucks: Truck[]
  editingId: number | null
  onEdit: (truck: Truck) => void
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Naziv</th>
            <th scope="col" className="num">
              Kapacitet (LDM)
            </th>
            <th scope="col">Tovarni prostor (D × Š × V)</th>
            <th scope="col">Dostupan</th>
            <th scope="col">
              <span className="visually-hidden">Akcije</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {trucks.map((truck) => (
            <tr key={truck.id} aria-current={truck.id === editingId ? 'true' : undefined}>
              <td>{truck.id}</td>
              <td>{truck.name}</td>
              <td className="num">{formatLdm(truck.capacityLdmTenths)}</td>
              <td>
                {formatDimensionsMm(truck.innerLengthMm, truck.innerWidthMm, truck.innerHeightMm) ?? (
                  <span className="text--muted">nije uneto</span>
                )}
              </td>
              <td>{truck.available ? 'Da' : <span className="text--muted">Ne</span>}</td>
              <td>
                <button type="button" onClick={() => onEdit(truck)} aria-label={`Izmeni ${truck.name}`}>
                  Izmeni
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
