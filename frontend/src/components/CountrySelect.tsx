import { countryOptions, isoCountryCode } from '../domain/countries'

/** The country of a place, chosen by name. `value` and `onChange` are the code ("" = none). */
export function CountrySelect({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  return (
    <select id={id} value={isoCountryCode(value)} onChange={(e) => onChange(e.target.value)}>
      <option value="">Nije izabrana</option>
      {countryOptions(value).map((country) => (
        <option key={country.code} value={country.code}>
          {country.name}
        </option>
      ))}
    </select>
  )
}
