import { useId, useState, type FormEvent } from 'react'
import { useApi } from '../../../api/apiContext'
import { ApiError, describeError } from '../../../api/client'
import type { ImportCreated, ImportField, ImportMapping } from '../../../api/types'
import { columnLetter, IMPORT_FIELDS, suggestMapping } from './importHelpers'

interface MappingStepProps {
  upload: ImportCreated
  /** the mapping chosen earlier, when coming back from the review */
  initial?: ImportMapping
  onBack: () => void
  onMapped: (mapping: ImportMapping) => void
}

const PREVIEW_DATA_ROWS = 5

export function MappingStep({ upload, initial, onBack, onMapped }: MappingStepProps) {
  const api = useApi()
  const id = useId()
  const [sheetName, setSheetName] = useState(initial?.sheetName ?? upload.sheets[0].name)
  const [headerRow, setHeaderRow] = useState(initial?.headerRow ?? 1)
  const sheet = upload.sheets.find((s) => s.name === sheetName) ?? upload.sheets[0]
  const headers = sheet.previewRows[headerRow - 1] ?? []
  const [columns, setColumns] = useState<ImportMapping['columns']>(() => initial?.columns ?? suggestMapping(headers))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const columnCount = Math.max(0, ...sheet.previewRows.map((r) => r.length))
  const columnOptions = Array.from({ length: columnCount }, (_, i) => ({
    index: i,
    label: headers[i] ? `${columnLetter(i)} · ${headers[i]}` : columnLetter(i),
  }))

  // A different sheet or header row means different column names: suggest again.
  const changeSource = (nextSheet: string, nextHeaderRow: number) => {
    setSheetName(nextSheet)
    setHeaderRow(nextHeaderRow)
    const nextHeaders = upload.sheets.find((s) => s.name === nextSheet)?.previewRows[nextHeaderRow - 1] ?? []
    setColumns(suggestMapping(nextHeaders))
    setErrors({})
  }

  const setColumn = (field: ImportField, value: string) =>
    setColumns((previous) => {
      const next = { ...previous }
      if (value === '') delete next[field]
      else next[field] = Number(value)
      return next
    })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const mapping: ImportMapping = { sheetName, headerRow, columns }
    setSaving(true)
    setErrors({})
    try {
      await api.setImportMapping(upload.importId, mapping)
      onMapped(mapping)
    } catch (e) {
      setErrors(e instanceof ApiError && e.problem.errors ? e.problem.errors : { form: describeError(e) })
      setSaving(false)
    }
  }

  const errorFor = (key: string) =>
    errors[key] && (
      <span className="field__error" id={`${id}-${key}-error`}>
        {errors[key]}
      </span>
    )

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate>
      <h2>Povežite kolone fajla „{upload.fileName}“</h2>

      <div className="mapping-source">
        {upload.sheets.length > 1 && (
          <div className="field">
            <label htmlFor={`${id}-sheet`}>List</label>
            <select id={`${id}-sheet`} value={sheetName} onChange={(e) => changeSource(e.target.value, headerRow)}>
              {upload.sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.rowCount} redova)
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-header`}>Red sa nazivima kolona</label>
          <select
            id={`${id}-header`}
            value={headerRow}
            onChange={(e) => changeSource(sheetName, Number(e.target.value))}
            aria-describedby={errors.headerRow ? `${id}-headerRow-error` : undefined}
          >
            {sheet.previewRows.map((_, index) => (
              <option key={index} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
          {errorFor('headerRow')}
        </div>
        <p className="text--muted mapping-source__count">
          List „{sheet.name}“ ima {sheet.rowCount} redova; podaci počinju u redu {headerRow + 1}.
        </p>
      </div>

      <div className="table-wrap mapping-table">
        <table className="table" aria-label="Mapiranje kolona">
          <thead>
            <tr>
              <th scope="col">Polje</th>
              <th scope="col">Kolona u fajlu</th>
              <th scope="col">Napomena</th>
            </tr>
          </thead>
          <tbody>
            {IMPORT_FIELDS.map(({ field, label, hint }) => (
              <tr key={field}>
                <th scope="row">
                  <label htmlFor={`${id}-${field}`}>{label}</label>
                </th>
                <td>
                  <select
                    id={`${id}-${field}`}
                    value={columns[field] ?? ''}
                    onChange={(e) => setColumn(field, e.target.value)}
                    aria-invalid={errors[field] ? true : undefined}
                    aria-describedby={errors[field] ? `${id}-${field}-error` : undefined}
                  >
                    <option value="">— nije izabrano —</option>
                    {columnOptions.map((option) => (
                      <option key={option.index} value={option.index}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errorFor(field)}
                </td>
                <td className="text--muted mapping-table__hint">{hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errorFor('columns')}
      {errors.form && (
        <p role="alert" className="text--error">
          {errors.form}
        </p>
      )}

      <h3 className="mapping-preview__title">Prvi redovi podataka</h3>
      <div className="table-wrap">
        <table className="table" aria-label="Prvi redovi podataka">
          <thead>
            <tr>
              <th scope="col">Red</th>
              {columnOptions.map((option) => (
                <th scope="col" key={option.index}>
                  {option.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.previewRows.slice(headerRow, headerRow + PREVIEW_DATA_ROWS).map((row, index) => (
              <tr key={index}>
                <td className="text--muted">{headerRow + index + 1}</td>
                {columnOptions.map((option) => (
                  <td key={option.index}>{row[option.index] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-actions wizard-actions">
        <button type="button" onClick={onBack} disabled={saving}>
          Nazad
        </button>
        <button type="submit" className="button--primary" disabled={saving}>
          {saving ? 'Čitanje redova…' : 'Dalje: pregled redova'}
        </button>
      </div>
    </form>
  )
}
