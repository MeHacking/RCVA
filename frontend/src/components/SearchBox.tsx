import { Search, X } from 'lucide-react'

/**
 * The search field of the top bar, as in smartLoad+: a soft pill; Escape or "Obriši" empties it.
 * `label` is its short name for screen readers (the placeholder is the visible hint).
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  return (
    <label className="search">
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onChange('')
        }}
      />
      {value && (
        <button type="button" className="search__clear" onClick={() => onChange('')}>
          <X aria-hidden="true" />
          <span>Obriši</span>
        </button>
      )}
    </label>
  )
}
