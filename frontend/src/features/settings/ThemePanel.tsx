import { useRef, useState, type ChangeEvent } from 'react'
import { flushSync } from 'react-dom'
import { DEFAULT_THEME, THEMES, loadTheme, revealTheme, saveTheme, type ThemeId } from '../../app/theme'
import { Icon } from '../../components/Icon'
import { SettingsPart } from './SettingsPart'

/**
 * Podešavanja, part 1: the theme. A card per theme with a small picture of the application in
 * its colours (menu, page, accent); the choice applies at once, spreading from where it was
 * clicked, and is kept on this device.
 */
export function ThemePanel() {
  const [theme, setTheme] = useState<ThemeId>(loadTheme)
  // Where the pointer went down last: the new theme spreads from there (from the card's centre
  // when it was chosen with the keyboard).
  const pointer = useRef<{ x: number; y: number; at: number } | null>(null)

  function choose(event: ChangeEvent<HTMLInputElement>, next: ThemeId) {
    const recent = pointer.current && event.timeStamp - pointer.current.at < 1000 ? pointer.current : null
    const box = (event.currentTarget.closest('.theme-option') ?? event.currentTarget).getBoundingClientRect()
    const origin = recent ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    saveTheme(next)
    revealTheme(next, origin, () => flushSync(() => setTheme(next)))
  }

  return (
    <div className="panel">
      <SettingsPart
        n={1}
        title="Izgled"
        about={
          <p className="text--muted">
            Boje aplikacije. Menja se odmah i pamti na ovom računaru (ne ulazi u izvoz podataka). PDF za štampu je uvek u
            svetlim bojama.
          </p>
        }
      >
        <fieldset
          className="theme-picker"
          onPointerDown={(event) => {
            pointer.current = { x: event.clientX, y: event.clientY, at: event.timeStamp }
          }}
        >
          <legend className="visually-hidden">Tema</legend>
          {THEMES.map((option) => (
            <label key={option.id} className={`theme-option theme-option--${option.id}`}>
              <input
                type="radio"
                name="theme"
                className="visually-hidden"
                value={option.id}
                checked={theme === option.id}
                onChange={(event) => choose(event, option.id)}
              />
              <span className="theme-option__preview" aria-hidden="true">
                <span className="theme-option__nav" />
                <span className="theme-option__page">
                  <span className="theme-option__line" />
                  <span className="theme-option__line theme-option__line--short" />
                  <span className="theme-option__button" />
                </span>
              </span>
              <span className="theme-option__text">
                <span className="theme-option__name">
                  {option.label}
                  {option.id === DEFAULT_THEME && <span className="text--muted"> (početna)</span>}
                </span>
                <span className="theme-option__about">{option.about}</span>
              </span>
              <span className="theme-option__check" aria-hidden="true">
                <Icon name="check" size={14} />
              </span>
            </label>
          ))}
        </fieldset>
      </SettingsPart>
    </div>
  )
}
