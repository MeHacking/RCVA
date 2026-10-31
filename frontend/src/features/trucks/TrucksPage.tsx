import { useCallback, useState } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { Truck } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatDimensionsMm, formatKg, formatLdm } from '../../format/units'
import { useAsyncData } from '../../hooks/useAsyncData'
import { TruckForm } from './TruckForm'

type Editing = { mode: 'create' } | { mode: 'edit'; truck: Truck } | null

export function TrucksPage() {
  const api = useApi()
  const load = useCallback(() => api.listTrucks(), [api])
  const [trucks, reload] = useAsyncData(load)
  const [editing, setEditing] = useState<Editing>(null)
  /** truck waiting for the user to confirm removal */
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleSaved = () => {
    setEditing(null)
    reload()
  }

  const askDelete = (truck: Truck) => {
    setDeleteError(null)
    setConfirmingId(truck.id)
  }

  async function confirmDelete(truck: Truck) {
    setDeletingId(truck.id)
    setDeleteError(null)
    try {
      await api.deleteTruck(truck.id)
      if (editing?.mode === 'edit' && editing.truck.id === truck.id) setEditing(null)
      setConfirmingId(null)
      reload()
    } catch (error) {
      setDeleteError(`Kamion „${truck.name}“ nije uklonjen: ${describeError(error)}`)
    } finally {
      setDeletingId(null)
    }
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

      {deleteError && (
        <p role="alert" className="text--error">
          {deleteError}
        </p>
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
            confirmingId={confirmingId}
            deletingId={deletingId}
            onEdit={(truck) => setEditing({ mode: 'edit', truck })}
            onAskDelete={askDelete}
            onConfirmDelete={(truck) => void confirmDelete(truck)}
            onCancelDelete={() => setConfirmingId(null)}
          />
        ))}
    </section>
  )
}

function TruckTable({
  trucks,
  editingId,
  confirmingId,
  deletingId,
  onEdit,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  trucks: Truck[]
  editingId: number | null
  confirmingId: number | null
  deletingId: number | null
  onEdit: (truck: Truck) => void
  onAskDelete: (truck: Truck) => void
  onConfirmDelete: (truck: Truck) => void
  onCancelDelete: () => void
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
            <th scope="col" className="num">
              Nosivost (kg)
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
              <td className="num">
                {truck.capacityKg === null ? <span className="text--muted">bez ograničenja</span> : formatKg(truck.capacityKg)}
              </td>
              <td>
                {formatDimensionsMm(truck.innerLengthMm, truck.innerWidthMm, truck.innerHeightMm) ?? (
                  <span className="text--muted">nije uneto</span>
                )}
              </td>
              <td>{truck.available ? 'Da' : <span className="text--muted">Ne</span>}</td>
              <td className="actions">
                {confirmingId === truck.id ? (
                  <span className="confirm-inline" role="group" aria-label={`Potvrda uklanjanja: ${truck.name}`}>
                    <span>Ukloniti kamion?</span>
                    <button
                      type="button"
                      className="button--danger"
                      onClick={() => onConfirmDelete(truck)}
                      disabled={deletingId === truck.id}
                    >
                      {deletingId === truck.id ? 'Uklanjanje…' : 'Da, ukloni'}
                    </button>
                    <button type="button" onClick={onCancelDelete} disabled={deletingId === truck.id}>
                      Otkaži
                    </button>
                  </span>
                ) : (
                  <span className="confirm-inline">
                    <button type="button" onClick={() => onEdit(truck)} aria-label={`Izmeni ${truck.name}`}>
                      Izmeni
                    </button>
                    <button
                      type="button"
                      className="button--ghost"
                      onClick={() => onAskDelete(truck)}
                      aria-label={`Ukloni ${truck.name}`}
                    >
                      Ukloni
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
