/**
 * Theme state: dark by default, with a persisted light toggle.
 *
 * Resolution order on first construction: localStorage['theme'] →
 * prefers-color-scheme: light → dark. Every change writes `data-theme` on
 * <html> (which flips the CSS token block) and persists to localStorage.
 *
 * Storage can be unavailable (Safari private mode, blocked site data): every
 * access may throw, even reading `localStorage` itself. Reads then fall back
 * to the system preference / dark, and writes are skipped — the theme still
 * applies for this visit, it just isn't remembered.
 *
 * Exported as a singleton for the app; the class is exported too so tests
 * can construct fresh instances with controlled storage/DOM.
 */
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

/** The persisted theme string, or null when absent or storage is unavailable. */
function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Persist the theme; a throwing storage is ignored (best effort). */
function writeStored(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage blocked — keep the in-memory theme only.
  }
}

function resolveInitial(): Theme {
  const stored = readStored()
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
    writeStored(theme)
    this.apply()
  }

  private apply(): void {
    document.documentElement.setAttribute('data-theme', this.current)
  }
}

export const theme = new ThemeStore()
