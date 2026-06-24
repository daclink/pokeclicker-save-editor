// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest'
import { ThemeStore } from '../src/lib/theme.svelte'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  // happy-dom defaults to prefers-color-scheme: light; neutralize it so
  // "no light preference" tests actually see no preference.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})

describe('ThemeStore', () => {
  test('defaults to dark when nothing stored and no light preference', () => {
    const t = new ThemeStore()
    expect(t.current).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  test('honors a stored theme over the default', () => {
    localStorage.setItem('theme', 'light')
    const t = new ThemeStore()
    expect(t.current).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  test('toggle flips, persists, and updates the root attribute', () => {
    const t = new ThemeStore()
    t.toggle()
    expect(t.current).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    t.toggle()
    expect(t.current).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  test('ignores a garbage stored value', () => {
    localStorage.setItem('theme', 'banana')
    const t = new ThemeStore()
    expect(t.current).toBe('dark')
  })
})
