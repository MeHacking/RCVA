import { useState } from 'react'
import { countryGroups, isoCountryCode, withRecentCountry, type Country } from '../domain/countries'

// Only a convenience of this device, so it is not in the device data and may be lost.
const STORAGE_KEY = 'rcva.recentCountries'

function loadRecent(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((code): code is string => typeof code === 'string') : []
  } catch {
    return []
  }
}

function remember(code: string) {
  if (!code) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withRecentCountry(loadRecent(), code)))
  } catch {
    // Without storage the list just stays as it is.
  }
}

const options = (countries: Country[]) =>
  countries.map((country) => (
    <option key={country.code} value={country.code}>
      {country.name}
    </option>
  ))

/** The country of a place, chosen by name. `value` and `onChange` are the code ("" = none). */
export function CountrySelect({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  // Read once, so the list does not reorder under the form.
  const [recent] = useState(loadRecent)
  const groups = countryGroups(value, recent)
  return (
    <select
      id={id}
      value={isoCountryCode(value)}
      onChange={(e) => {
        remember(e.target.value)
        onChange(e.target.value)
      }}
    >
      <option value="">Nije izabrana</option>
      <optgroup label="Nedavno korišćene">{options(groups.recent)}</optgroup>
      <optgroup label="Ostale države">{options(groups.others)}</optgroup>
    </select>
  )
}
