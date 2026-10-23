import { Fragment, useCallback, useState } from 'react'
import { useApi } from '../../../api/apiContext'
import { describeError } from '../../../api/client'
import type { ImportRow, PlaceGuess } from '../../../api/types'
import { Badge } from '../../../components/Badge'
import { ErrorState, LoadingState } from '../../../components/states'
import { formatKg, formatLdm } from '../../../format/units'
import { useAsyncData } from '../../../hooks/useAsyncData'
import { summarizeImport } from './importHelpers'
import { RowEditor } from './RowEditor'

const COLUMNS = 7

interface ReviewStepProps {
  importId: number
  onBack: () => void
  onNext: () => void
}

export function ReviewStep({ importId, onBack, onNext }: ReviewStepProps) {
  const api = useApi()
  const load = useCallback(() => api.getImportPreview(importId), [api, importId])
  const [preview, reload] = useAsyncData(load)
  /** null = automatic: only rows with errors while there are any */
  const [onlyErrorsChoice, setOnlyErrorsChoice] = useState<boolean | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  /** row whose include/exclude request is in flight */
  const [pendingRow, setPendingRow] = useState<number | null>(null)

  if (preview.status === 'loading') return <LoadingState label="Čitanje redova…" />
  if (preview.status === 'error') return <ErrorState title="Pregled nije učitan" message={preview.message} onRetry={reload} />

  const { rows } = preview.data
  const summary = summarizeImport(rows)
  const onlyErrors = onlyErrorsChoice ?? summary.withErrors > 0
  const visible = onlyErrors ? rows.filter((r) => r.errors.length > 0 && !r.excluded) : rows

  async function toggleExcluded(row: ImportRow) {
    setActionError(null)
    setPendingRow(row.rowNumber)
    try {
      await api.updateImportRow(importId, row.rowNumber, { excluded: !row.excluded })
      reload()
    } catch (e) {
      setActionError(describeError(e))
    } finally {
      setPendingRow(null)
    }
  }

  return (
    <div className="panel">
      <h2>Pregled redova, grešaka i duplikata</h2>
      <dl className="import-summary">
        <div>
          <dt>Redova</dt>
          <dd>{summary.total}</dd>
        </div>
        <div className="import-summary--success">
          <dt>Spremno za upis</dt>
          <dd>{summary.ready}</dd>
        </div>
        <div className={summary.withErrors > 0 ? 'import-summary--danger' : undefined}>
          <dt>Sa greškom</dt>
          <dd>{summary.withErrors}</dd>
        </div>
        <div>
          <dt>Isključeno</dt>
          <dd>{summary.excluded}</dd>
        </div>
        <div>
          <dt>Ručno ispravljeno</dt>
          <dd>{summary.corrected}</dd>
        </div>
      </dl>

      <div className="field field--checkbox">
        <input
          id="only-errors"
          type="checkbox"
          checked={onlyErrors}
          onChange={(e) => setOnlyErrorsChoice(e.target.checked)}
        />
        <label htmlFor="only-errors">Prikaži samo redove sa greškom</label>
      </div>
      {actionError && (
        <p role="alert" className="text--error">
          {actionError}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text--muted">
          {onlyErrors ? 'Nema redova sa greškom.' : 'Fajl nema redova sa podacima ispod reda sa nazivima kolona.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table import-table" aria-label="Redovi za uvoz">
            <thead>
              <tr>
                <th scope="col">Red · ID · tekst iz fajla</th>
                <th scope="col">Preuzimanje</th>
                <th scope="col">Isporuka</th>
                <th scope="col" className="num">
                  LDM
                </th>
                <th scope="col" className="num">
                  Težina (kg)
                </th>
                <th scope="col">Status i problemi</th>
                <th scope="col">
                  <span className="visually-hidden">Akcije</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <Fragment key={row.rowNumber}>
                  <tr className={row.excluded ? 'import-table__row--excluded' : undefined}>
                    <th scope="row" className="import-table__source">
                      {row.rowNumber} <span className="import-table__id">{row.externalId}</span>
                      <span>{row.sourceText}</span>
                    </th>
                    <td>
                      <Place place={row.pickup} />
                    </td>
                    <td>
                      <Place place={row.delivery} />
                    </td>
                    <td className="num">{row.ldmTenths === null ? '–' : formatLdm(row.ldmTenths)}</td>
                    <td className="num">{row.weightKg === null ? '–' : formatKg(row.weightKg)}</td>
                    <td className="import-table__problems">
                      <RowStatus row={row} />
                    </td>
                    <td className="actions">
                      <div className="import-table__actions">
                        <button
                          type="button"
                          className="button--small"
                          onClick={() => setEditing(editing === row.rowNumber ? null : row.rowNumber)}
                          aria-expanded={editing === row.rowNumber}
                          aria-label={`Ispravi red ${row.rowNumber}`}
                          disabled={row.excluded || pendingRow === row.rowNumber}
                        >
                          Ispravi
                        </button>
                        <button
                          type="button"
                          className="button--small button--ghost"
                          onClick={() => void toggleExcluded(row)}
                          aria-label={`${row.excluded ? 'Uključi' : 'Isključi'} red ${row.rowNumber}`}
                          disabled={pendingRow === row.rowNumber}
                        >
                          {row.excluded ? 'Uključi' : 'Isključi'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing === row.rowNumber && (
                    <tr className="import-table__editor">
                      <td colSpan={COLUMNS}>
                        <RowEditor
                          importId={importId}
                          row={row}
                          onSaved={() => {
                            setEditing(null)
                            reload()
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-actions wizard-actions">
        <button type="button" onClick={onBack}>
          Nazad na mapiranje
        </button>
        <button type="button" className="button--primary" onClick={onNext} disabled={pendingRow !== null}>
          Dalje: potvrda
        </button>
        <span className="text--muted wizard-actions__note">
          Povratak na mapiranje ponovo čita fajl; ručne ispravke se tada gube.
        </span>
      </div>
    </div>
  )
}

function Place({ place }: { place: PlaceGuess | null }) {
  if (!place) return <span className="text--error">nedostaje</span>
  const extra = [place.postalCode, place.country].filter(Boolean).join(' · ')
  return (
    <>
      {place.name}
      {extra && <span className="text--muted"> · {extra}</span>}
    </>
  )
}

function RowStatus({ row }: { row: ImportRow }) {
  if (row.excluded) {
    return (
      <div className="row-status">
        <Badge>Isključen</Badge>
      </div>
    )
  }
  return (
    <div className="row-status">
      {row.errors.length > 0 ? (
        <Badge tone="danger">Greška</Badge>
      ) : (
        <Badge tone="success">{row.corrected ? 'Ispravljen' : 'Spreman'}</Badge>
      )}
      {row.errors.length + row.warnings.length > 0 && (
        <ul className="row-status__list">
          {row.errors.map((message) => (
            <li key={message} className="text--error">
              {message}
            </li>
          ))}
          {row.warnings.map((message) => (
            <li key={message} className="text--muted">
              {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
