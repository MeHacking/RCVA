/**
 * The look of the application (Podešavanja > Izgled), the owner's palettes from smartLoad. The
 * colours are in styles/tokens.css; a theme is only an attribute on <html>. Kept per device in
 * the browser's storage, not in the device data (an export or a reset leaves it as it is).
 */
export type ThemeId = 'visnja' | 'teget' | 'suma' | 'grafit' | 'neon'

// In the order of smartLoad+ (owner, 21.11.2026); Višnja stays the default.
export const THEMES: ReadonlyArray<{ id: ThemeId; label: string }> = [
  { id: 'teget', label: 'Teget' },
  { id: 'grafit', label: 'Grafit' },
  { id: 'suma', label: 'Šuma' },
  { id: 'neon', label: 'Neon' },
  { id: 'visnja', label: 'Višnja' },
]

/** The palette RCVA started with: no attribute, the values in :root. */
export const DEFAULT_THEME: ThemeId = 'visnja'

const STORAGE_KEY = 'rcva.theme'

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isThemeId(saved) ? saved : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function saveTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage blocked (a private window): the theme holds until the page is closed.
  }
}

export function applyTheme(theme: ThemeId, root: HTMLElement = document.documentElement): void {
  if (theme === DEFAULT_THEME) root.removeAttribute('data-theme')
  else root.dataset.theme = theme
}

/** How far the circle must grow from (x, y) to cover a window of width × height. */
export function revealRadius(x: number, y: number, width: number, height: number): number {
  return Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y)))
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> }
}

/** Another change (of the screen or the theme) still on: a new one would cut it off. */
function transitionActive(root: HTMLElement): boolean {
  try {
    return root.matches(':active-view-transition')
  } catch {
    return false
  }
}

/**
 * Changes the theme: the new one spreads in a circle from (x, y) over the old one. Without view
 * transitions in the browser, or with "reduce motion", it changes at once. `update` must bring
 * the page to the new theme synchronously (React: flushSync), so the circle shows the new page.
 */
export function revealTheme(theme: ThemeId, origin: { x: number; y: number }, update: () => void): void {
  const doc = document as ViewTransitionDocument
  const root = doc.documentElement
  const change = () => {
    applyTheme(theme, root)
    update()
  }
  if (
    typeof doc.startViewTransition !== 'function' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    transitionActive(root)
  ) {
    change()
    return
  }
  root.style.setProperty('--theme-x', `${origin.x}px`)
  root.style.setProperty('--theme-y', `${origin.y}px`)
  root.style.setProperty('--theme-r', `${revealRadius(origin.x, origin.y, innerWidth, innerHeight)}px`)
  // The class keeps the screen change's own transition (.app__main alone) out of this one.
  root.classList.add('theme-switching')
  const transition = doc.startViewTransition.call(doc, change)
  // Cut off by another change (a click in the menu at once): the theme is applied all the same,
  // only the circle is skipped; the browser then rejects `ready`, which is no error here.
  transition.ready.catch(() => {})
  void transition.finished.finally(() => root.classList.remove('theme-switching'))
}
