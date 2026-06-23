/**
 * Theme state: dark by default, with a persisted light toggle.
 *
 * Resolution order on first construction: localStorage['theme'] →
 * prefers-color-scheme: light → dark. Every change writes `data-theme` on
 * <html> (which flips the CSS token block) and persists to localStorage.
 *
 * Exported as a singleton for the app; the class is exported too so tests
 * can construct fresh instances with controlled storage/DOM.
 */
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

function resolveInitial(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  const prefersLight = window.matchMedia?.(
    '(prefers-color-scheme: light)',
  ).matches
  return prefersLight ? 'light' : 'dark'
}

export class ThemeStore {
  current = $state<Theme>('dark')

  constructor() {
    this.current = resolveInitial()
    this.apply()
  }

  toggle(): void {
    this.set(this.current === 'dark' ? 'light' : 'dark')
  }

  set(theme: Theme): void {
    this.current = theme
    localStorage.setItem(STORAGE_KEY, theme)
    this.apply()
  }

  private apply(): void {
    document.documentElement.setAttribute('data-theme', this.current)
  }
}

export const theme = new ThemeStore()
