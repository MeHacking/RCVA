import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, THEMES, applyTheme, isThemeId, loadTheme, revealRadius, saveTheme } from '../../src/app/theme'
import tokens from '../../src/styles/tokens.css?raw'

describe('theme choice', () => {
  it('knows the five themes, Višnja first and the default', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(['visnja', 'teget', 'suma', 'grafit', 'neon'])
    expect(DEFAULT_THEME).toBe('visnja')
    expect(isThemeId('teget')).toBe(true)
    expect(isThemeId('Teget')).toBe(false)
    expect(isThemeId(null)).toBe(false)
  })

  it('puts the theme on the root as an attribute, and none for Višnja', () => {
    const attributes = new Map<string, string>()
    const root = {
      dataset: {} as Record<string, string>,
      removeAttribute: (name: string) => attributes.delete(name),
    }
    applyTheme('grafit', root as unknown as HTMLElement)
    expect(root.dataset.theme).toBe('grafit')
    attributes.set('data-theme', 'grafit')
    applyTheme('visnja', root as unknown as HTMLElement)
    expect(attributes.has('data-theme')).toBe(false)
  })

  it('remembers the theme on the device, and falls back to Višnja on anything else', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }
    const before = globalThis.localStorage
    try {
      Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
      expect(loadTheme()).toBe('visnja')
      saveTheme('neon')
      expect(loadTheme()).toBe('neon')
      store.set('rcva.theme', 'purple')
      expect(loadTheme()).toBe('visnja')
      Object.defineProperty(globalThis, 'localStorage', {
        get: () => {
          throw new Error('blocked')
        },
        configurable: true,
      })
      expect(loadTheme()).toBe('visnja')
      expect(() => saveTheme('teget')).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: before, configurable: true })
    }
  })

  it('grows the circle to the farthest corner of the window', () => {
    expect(revealRadius(0, 0, 300, 400)).toBe(500)
    expect(revealRadius(300, 400, 300, 400)).toBe(500)
    expect(revealRadius(150, 200, 300, 400)).toBe(250)
    expect(revealRadius(100, 100, 300, 400)).toBe(Math.ceil(Math.hypot(200, 300)))
  })
})

/* ---- Contrast of every theme, read from tokens.css ---------------------------------------- */

type Rgba = [number, number, number, number]

const css = tokens.replace(/\/\*[\s\S]*?\*\//g, '')

/** The custom properties of the first rule whose selector is exactly `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no rule ${selector}`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const values = new Map<string, string>()
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) values.set(match[1], match[2].trim())
  return values
}

function themeValues(theme: string): Map<string, string> {
  const values = new Map(block(':root'))
  if (theme === 'visnja') return values
  if (theme === 'grafit' || theme === 'neon') {
    for (const [key, value] of block(":root:is([data-theme='grafit'], [data-theme='neon'])")) values.set(key, value)
  }
  for (const [key, value] of block(`:root[data-theme='${theme}']`)) values.set(key, value)
  return values
}

function resolve(values: Map<string, string>, name: string, depth = 0): string {
  const raw = values.get(name)
  if (raw === undefined || depth > 10) throw new Error(`${name} is not set`)
  const reference = /^var\((--[\w-]+)\)$/.exec(raw)
  return reference ? resolve(values, reference[1], depth + 1) : raw
}

function parse(color: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(color)
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1].split(',').map((part) => Number(part.trim()))
    return [r, g, b, a]
  }
  throw new Error(`not a colour: ${color}`)
}

/** `top` laid over the opaque `under`. */
function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3]
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) as Rgba
}

function luminance([r, g, b]: Rgba): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgba, b: Rgba): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe.each(THEMES.map((theme) => theme.id))('theme %s', (theme) => {
  const values = themeValues(theme)
  const color = (name: string) => parse(resolve(values, name))
  const page = color('--bg')
  // A glass card over the page (its blur aside), and a tinted notice over a card.
  const card = over(color('--card-surface'), page)
  const solid = (name: string, under: Rgba = card) => over(color(name), under)

  // [what, foreground, background, at least]
  const pairs: Array<[string, Rgba, Rgba, number]> = [
    ['text on the page', color('--text'), page, 4.5],
    ['text on a card', color('--text'), card, 4.5],
    ['text in a field', color('--text'), color('--surface'), 4.5],
    ['muted text on a card', color('--text-muted'), card, 4.5],
    ['muted text in a field', color('--text-muted'), color('--surface'), 4.5],
    ['a link on a card', color('--accent'), card, 4.5],
    ['a primary button', color('--accent-text'), color('--accent'), 4.5],
    ['a primary button under the pointer', color('--accent-text'), color('--accent-hover'), 4.5],
    ['a danger button', color('--accent-text'), color('--danger'), 4.5],
    ['the accent on cream', color('--accent-on-light'), color('--cream'), 4.5],
    ['the menu', color('--nav-text'), color('--nav-bg'), 4.5],
    ['the open screen in the menu', color('--nav-text-active'), color('--nav-bg'), 4.5],
    ['the mark of the open screen', color('--nav-text-active'), color('--nav-accent'), 3],
    ['text on the accent card', color('--on-dark-text'), solid('--card-cherry-surface', page), 4.5],
    ['text on the dark card', color('--on-dark-text'), solid('--card-dark-surface', page), 4.5],
    ['muted text on the dark card', color('--on-dark-muted'), solid('--card-dark-surface', page), 4.5],
    ['a bar on the dark card', color('--on-dark-accent'), solid('--card-dark-surface', page), 3],
    ['the dark card button', color('--on-dark-text'), color('--dark-grey'), 4.5],
    ['a success notice', color('--success'), solid('--success-subtle'), 4.5],
    ['a warning notice', color('--warning'), solid('--warning-subtle'), 4.5],
    ['a danger notice', color('--danger'), solid('--danger-subtle'), 4.5],
    ['an error on a card', color('--danger'), card, 4.5],
  ]

  it.each(pairs)('%s is readable', (_what, foreground, background, least) => {
    expect(contrast(over(foreground, background), background)).toBeGreaterThanOrEqual(least)
  })

  it('tells danger apart from the accent', () => {
    const [a, d] = [color('--accent'), color('--danger')]
    const distance = Math.hypot(a[0] - d[0], a[1] - d[1], a[2] - d[2])
    expect(distance).toBeGreaterThan(60)
  })
})
