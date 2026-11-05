import { useCallback, useState } from 'react'
import { useApi } from '../../api/apiContext'
import { apiMode } from '../../api/apiMode'
import { describeError } from '../../api/client'
import type { Truck, TruckType } from '../../api/types'
import { Icon } from '../../components/Icon'
import { Notice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { formatDimensionsMm, formatKg, formatLdm } from '../../format/units'
import { useAsyncData } from '../../hooks/useAsyncData'
import { TruckForm } from './TruckForm'
import { TruckLocations } from './TruckLocations'
import { TruckTypeForm } from './TruckTypeForm'
import { TruckTypes } from './TruckTypes'

/** Removing every truck at once is the device's (and the mock's); the backend has it not. */
const CAN_REMOVE_ALL = apiMode() !== 'server'

/** One form at a time on the page: a truck's or a truck type's. */
type Editing =
  | { mode: 'create' }
  | { mode: 'edit'; truck: Truck }
  | { mode: 'createType' }
  | { mode: 'editType'; type: TruckType }
  | null

export function TrucksPage() {
  const api = useApi()
  const load = useCallback(() => api.listTrucks(), [api])
  const [trucks, reload] = useAsyncData(load)
  // Only the application on the device knows where the trucks are (null elsewhere).
  const loadStarts = useCallback(() => api.getTruckStarts(), [api])
  const [starts, reloadStarts] = useAsyncData(loadStarts)
  // Only the application on the device keeps truck types (null on the backend).
  const loadTypes = useCallback(() => api.listTruckTypes(), [api])
  const [types, reloadTypes] = useAsyncData(loadTypes)
  const typeList = types.status === 'success' ? (types.data ?? []) : []
  const [editing, setEditing] = useState<Editing>(null)
  /** the truck types card: shown on "Dodaj tip kamiona", until closed */
  const [typesOpen, setTypesOpen] = useState(false)
  // One card open at a time: the types card or a truck's form.
  const editType = (next: Editing) => {
    setEditing(next)
    setTypesOpen(true)
  }
  const editTruck = (next: Editing) => {
    setEditing(next)
    setTypesOpen(false)
  }
  const closeTypes = () => {
    setTypesOpen(false)
    if (editing?.mode === 'createType' || editing?.mode === 'editType') setEditing(null)
  }
  /** truck waiting for the user to confirm removal */
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  /** "Ukloni sve kamione": asked, being done, or done with the trucks kept for "Poništi" */
  const [removeAll, setRemoveAll] = useState<'idle' | 'asking' | 'removing' | 'restoring'>('idle')
  const [removed, setRemoved] = useState<Truck[] | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function removeAllTrucks() {
    setRemoveAll('removing')
    setRemoveError(null)
    try {
      setRemoved(await api.deleteAllTrucks())
      setRemoveAll('idle')
      setEditing(null)
      reload()
      reloadStarts()
    } catch (error) {
      setRemoveError(`Kamioni nisu uklonjeni: ${describeError(error)}`)
      setRemoveAll('asking')
    }
  }

  async function undoRemoveAll() {
    if (!removed) return
    setRemoveAll('restoring')
    setRemoveError(null)
    try {
      await api.restoreTrucks(removed)
      setRemoved(null)
      reload()
      reloadStarts()
    } catch (error) {
      setRemoveError(`Kamioni nisu vraćeni: ${describeError(error)}`)
    }
    setRemoveAll('idle')
  }

  const handleSaved = () => {
    // A new truck may take a removed one's id: there is nothing to undo any more.
    if (editing?.mode === 'create') setRemoved(null)
    setEditing(null)
    reload()
    reloadStarts()
  }

  const handleTypeSaved = () => {
    setEditing(null)
    reloadTypes()
  }

  const handleTypeDeleted = (type: TruckType) => {
    if (editing?.mode === 'editType' && editing.type.id === type.id) setEditing(null)
    reloadTypes()
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
      reloadStarts()
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
          <>
            <button
              type="button"
              className="button--primary"
              onClick={() => editTruck({ mode: 'create' })}
              disabled={trucks.status !== 'success' || types.status === 'loading'}
            >
              <Icon name="plus" size={16} />
              Dodaj kamion
            </button>
            {/* Only where types are kept (not on the backend). */}
            {types.status === 'success' && types.data && (
              <button type="button" onClick={() => editType({ mode: 'createType' })}>
                <Icon name="layers" size={16} />
                Dodaj tip kamiona
              </button>
            )}
          </>
        }
      />

      {(editing?.mode === 'create' || editing?.mode === 'edit') && (
        <TruckForm
          key={editing.mode === 'edit' ? editing.truck.id : 'new'}
          truck={editing.mode === 'edit' ? editing.truck : null}
          trucks={trucks.status === 'success' ? trucks.data : []}
          types={typeList}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      {typesOpen && types.status === 'success' && types.data && (
        <TruckTypes
          types={types.data}
          editingId={editing?.mode === 'editType' ? editing.type.id : null}
          onClose={closeTypes}
          onEdit={(type) => editType({ mode: 'editType', type })}
          onDeleted={handleTypeDeleted}
          form={
            (editing?.mode === 'createType' || editing?.mode === 'editType') && (
              <TruckTypeForm
                key={editing.mode === 'editType' ? editing.type.id : 'new'}
                type={editing.mode === 'editType' ? editing.type : null}
                onSaved={handleTypeSaved}
                onClose={closeTypes}
              />
            )
          }
        />
      )}
      {removeAll !== 'idle' && removeAll !== 'restoring' && trucks.status === 'success' && (
        <Notice tone="warning" title={`Ukloniti sve kamione (${trucks.data.length})?`} role="status">
          <p>
            Brišu se svi kamioni i njihove lokacije. Rezultati optimizacije ostaju. Odmah posle možete da poništite.
          </p>
          {removeError && (
            <p role="alert" className="text--error">
              {removeError}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button--danger"
              onClick={() => void removeAllTrucks()}
              disabled={removeAll === 'removing'}
            >
              {removeAll === 'removing' ? 'Uklanjanje…' : 'Da, ukloni sve'}
            </button>
            <button type="button" onClick={() => setRemoveAll('idle')} disabled={removeAll === 'removing'}>
              Odustani
            </button>
          </div>
        </Notice>
      )}
      {removed && (
        <Notice tone="success" title={`Uklonjeno kamiona: ${removed.length}`} role="status">
          <p>
            Kamioni i njihove lokacije su uklonjeni. Dok ne dodate nov kamion ili ne napustite ekran, možete ih vratiti.
          </p>
          {removeError && (
            <p role="alert" className="text--error">
              {removeError}
            </p>
          )}
          <div className="form-actions">
            <button type="button" onClick={() => void undoRemoveAll()} disabled={removeAll === 'restoring'}>
              {removeAll === 'restoring' ? 'Vraćanje…' : 'Poništi'}
            </button>
          </div>
        </Notice>
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
            Dodajte prvi kamion dugmetom „Dodaj kamion“. Za optimizaciju je dovoljan naziv i kapacitet u LDM; dimenzije
            tovarnog prostora su potrebne samo za 3D prikaz.
          </EmptyState>
        ) : (
          <section className="panel truck-card" aria-labelledby="truck-list">
            <div className="truck-card__header">
              <h2 id="truck-list">Spisak kamiona</h2>
              {CAN_REMOVE_ALL && (
                <button
                  type="button"
                  className="button--primary"
                  onClick={() => {
                    setRemoveError(null)
                    setRemoveAll('asking')
                  }}
                  disabled={removeAll !== 'idle'}
                >
                  <Icon name="trash" size={14} />
                  Ukloni sve kamione
                </button>
              )}
            </div>
            <p className="text--muted">
              Kamioni koje optimizacija može da koristi. Kamion koji nije dostupan ne ulazi u optimizaciju.
            </p>
            <TruckTable
              trucks={trucks.data}
              editingId={editing?.mode === 'edit' ? editing.truck.id : null}
              confirmingId={confirmingId}
              deletingId={deletingId}
              onEdit={(truck) => editTruck({ mode: 'edit', truck })}
              onAskDelete={askDelete}
              onConfirmDelete={(truck) => void confirmDelete(truck)}
              onCancelDelete={() => setConfirmingId(null)}
            />
          </section>
        ))}

      {trucks.status === 'success' && trucks.data.length > 0 && starts.status === 'success' && starts.data && (
        <section className="panel truck-card truck-locations" aria-labelledby="truck-locations">
          <h2 id="truck-locations">Lokacije kamiona</h2>
          <p className="text--muted">
            Ruta svakog kamiona počinje tamo gde se kamion nalazi, pa se i vožnja do prvog utovara računa u kilometre.
            Posle optimizacije aplikacija predlaže mesto poslednje isporuke; predlog važi tek kada ga potvrdite.
          </p>
          <TruckLocations trucks={trucks.data} starts={starts.data} onChanged={reloadStarts} />
        </section>
      )}
      {starts.status === 'error' && (
        <ErrorState title="Lokacije kamiona nisu učitane" message={starts.message} onRetry={reloadStarts} />
      )}

      {types.status === 'error' && (
        <ErrorState title="Tipovi kamiona nisu učitani" message={types.message} onRetry={reloadTypes} />
      )}
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
      <table className="table" aria-label="Kamioni">
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
                {truck.capacityKg === null ? (
                  <span className="text--muted">bez ograničenja</span>
                ) : (
                  formatKg(truck.capacityKg)
                )}
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
                      className="button--primary"
                      onClick={() => onAskDelete(truck)}
                      aria-label={`Ukloni ${truck.name}`}
                    >
                      <Icon name="trash" size={14} />
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
