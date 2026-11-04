import { useState, type ReactNode } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { TruckType } from '../../api/types'
import { formatDimensionsMm, formatKg, formatLdm } from '../../format/units'
import { PAYLOAD_SUPPORTED } from './truckFormValidation'
import { STANDARD_TYPE } from './truckTemplates'

/**
 * "Tipovi kamiona": the built-in standard curtain-sider, which does not change (the extra
 * curtain-siders the application proposes have its measures), and the types the user added.
 * The form (`form`) opens inside the section, above the table.
 */
export function TruckTypes({
  types,
  editingId,
  form,
  onAdd,
  onEdit,
  onDeleted,
}: {
  types: TruckType[]
  /** the type in the open form, if any */
  editingId: number | null
  form: ReactNode
  onAdd: () => void
  onEdit: (type: TruckType) => void
  onDeleted: (type: TruckType) => void
}) {
  const api = useApi()
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function confirmDelete(type: TruckType) {
    setDeletingId(type.id)
    setDeleteError(null)
    try {
      await api.deleteTruckType(type.id)
      setConfirmingId(null)
      onDeleted(type)
    } catch (error) {
      setDeleteError(`Tip „${type.name}“ nije uklonjen: ${describeError(error)}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="panel truck-types" aria-labelledby="truck-types">
      <div className="truck-types__header">
        <h2 id="truck-types">Tipovi kamiona</h2>
        <button type="button" onClick={onAdd}>
          Dodaj tip
        </button>
      </div>
      <p className="text--muted">
        Pri dodavanju kamiona možete izabrati tip, pa se kapacitet, nosivost i dimenzije popune sami. Standardna cerada je
        ugrađena i ne menja se; po njoj aplikacija predlaže i dodatne kamione kada postojeći nisu dovoljni.
      </p>

      {form}

      {deleteError && (
        <p role="alert" className="text--error">
          {deleteError}
        </p>
      )}

      <div className="table-wrap">
        <table className="table" aria-label="Tipovi kamiona">
          <thead>
            <tr>
              <th scope="col">Naziv</th>
              <th scope="col" className="num">
                Kapacitet (LDM)
              </th>
              {PAYLOAD_SUPPORTED && (
                <th scope="col" className="num">
                  Nosivost (kg)
                </th>
              )}
              <th scope="col">Tovarni prostor (D × Š × V)</th>
              <th scope="col">
                <span className="visually-hidden">Akcije</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <TypeRow type={STANDARD_TYPE}>
              <span className="text--muted">ugrađen</span>
            </TypeRow>
            {types.map((type) => (
              <TypeRow key={type.id} type={type} current={type.id === editingId}>
                {confirmingId === type.id ? (
                  <span className="confirm-inline" role="group" aria-label={`Potvrda uklanjanja tipa: ${type.name}`}>
                    <span>Ukloniti tip?</span>
                    <button
                      type="button"
                      className="button--danger"
                      onClick={() => void confirmDelete(type)}
                      disabled={deletingId === type.id}
                    >
                      {deletingId === type.id ? 'Uklanjanje…' : 'Da, ukloni'}
                    </button>
                    <button type="button" onClick={() => setConfirmingId(null)} disabled={deletingId === type.id}>
                      Otkaži
                    </button>
                  </span>
                ) : (
                  <span className="confirm-inline">
                    <button type="button" onClick={() => onEdit(type)} aria-label={`Izmeni tip ${type.name}`}>
                      Izmeni
                    </button>
                    <button
                      type="button"
                      className="button--ghost"
                      onClick={() => {
                        setDeleteError(null)
                        setConfirmingId(type.id)
                      }}
                      aria-label={`Ukloni tip ${type.name}`}
                    >
                      Ukloni
                    </button>
                  </span>
                )}
              </TypeRow>
            ))}
          </tbody>
        </table>
      </div>
      {types.length === 0 && (
        <p className="text--muted">Još niste dodali nijedan tip. Dodajte ga dugmetom „Dodaj tip“.</p>
      )}
    </section>
  )
}

function TypeRow({ type, current = false, children }: { type: Omit<TruckType, 'id'>; current?: boolean; children: ReactNode }) {
  return (
    <tr aria-current={current ? 'true' : undefined}>
      <td>{type.name}</td>
      <td className="num">{formatLdm(type.capacityLdmTenths)}</td>
      {PAYLOAD_SUPPORTED && (
        <td className="num">
          {type.capacityKg === null ? <span className="text--muted">bez ograničenja</span> : formatKg(type.capacityKg)}
        </td>
      )}
      <td>
        {formatDimensionsMm(type.innerLengthMm, type.innerWidthMm, type.innerHeightMm) ?? (
          <span className="text--muted">nije uneto</span>
        )}
      </td>
      <td className="actions">{children}</td>
    </tr>
  )
}
