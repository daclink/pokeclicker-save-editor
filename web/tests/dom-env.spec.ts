// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest'

// Proves the per-file happy-dom docblock gives component/theme tests a DOM
// while the global vitest environment stays 'node' (vite.config.ts).
describe('happy-dom env', () => {
  test('document and localStorage exist', () => {
    expect(typeof document).toBe('object')
    document.documentElement.setAttribute('data-theme', 'dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    localStorage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })
})
