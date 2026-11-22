import { Anchor, Check, Cherry, Moon, Palette, TreePine, Zap } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { flushSync } from 'react-dom'
import { THEMES, loadTheme, revealTheme, saveTheme, type ThemeId } from '../../app/theme'
import { SettingsPart, type PartRef } from './SettingsPart'

/**
 * Podešavanja, part 1: the theme. A card per theme with a small picture of the application in
 * its colours (menu, page, accent); the choice applies at once, spreading from where it was
 * clicked, and is kept on this device. Icons and words as in smartLoad+ (owner, 21.11.2026).
 */
const THEME_ICONS = { grafit: Moon, teget: Anchor, neon: Zap, suma: TreePine, visnja: Cherry } as const

export function ThemePanel({ partRef }: { partRef: PartRef }) {
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
    <SettingsPart
      id="izgled"
      icon={Palette}
      title="Izgled"
      partRef={partRef}
      className="theme-part"
      about={
        <p className="text--muted">Tema menja boje aplikacije. Važi odmah i pamti se u ovom pregledaču.</p>
      }
    >
      <fieldset
        className="theme-picker"
        onPointerDown={(event) => {
          pointer.current = { x: event.clientX, y: event.clientY, at: event.timeStamp }
        }}
      >
        <legend className="visually-hidden">Tema</legend>
        {THEMES.map((option) => {
          const Glyph = THEME_ICONS[option.id]
          return (
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
                <span className="theme-option__nav">
                  <span className="theme-option__pill" />
                  <span className="theme-option__dot" />
                  <span className="theme-option__dot" />
                </span>
                <span className="theme-option__page">
                  <span className="theme-option__bar" />
                  <span className="theme-option__line" />
                  <span className="theme-option__line theme-option__line--short" />
                  <span className="theme-option__button" />
                </span>
              </span>
              <span className="theme-option__name">
                <Glyph aria-hidden="true" />
                {option.label}
              </span>
              <span className="theme-option__check" aria-hidden="true">
                <Check />
              </span>
            </label>
          )
        })}
      </fieldset>
    </SettingsPart>
  )
}
