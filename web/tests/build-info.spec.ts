/**
 * Build-info helpers: the version shown in the app comes from `_version.py`
 * (the one place scripts/release.py bumps) plus the commit the bundle was
 * built from, so the live site says exactly which build it is.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { buildLabel, commitUrl, parseVersionPy, shortSha } from '../build-info'
import { APP_VERSION, BUILD_SHA } from '../src/lib/buildInfo'

describe('parseVersionPy', () => {
  test('reads __version__ from the real _version.py', () => {
    const src = readFileSync(resolve(__dirname, '..', '..', '_version.py'), 'utf8')
    expect(parseVersionPy(src)).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test('accepts single or double quotes and surrounding docstring noise', () => {
    expect(parseVersionPy('"""doc __version__ = "9.9.9" in prose"""\n__version__ = "0.9.0"\n')).toBe('0.9.0')
    expect(parseVersionPy("__version__ = '1.2.3'")).toBe('1.2.3')
  })

  test('rejects a file without a semver __version__ assignment', () => {
    expect(() => parseVersionPy('VERSION = "1.0.0"')).toThrow()
    expect(() => parseVersionPy('__version__ = "latest"')).toThrow()
    expect(() => parseVersionPy('')).toThrow()
  })
})

describe('shortSha', () => {
  test('shortens a full hex sha to 7 chars', () => {
    expect(shortSha('678f4b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f60')).toBe('678f4b0')
  })

  test('falls back to "dev" for missing or non-hex input', () => {
    expect(shortSha(undefined)).toBe('dev')
    expect(shortSha('')).toBe('dev')
    expect(shortSha('not-a-sha')).toBe('dev')
  })
})

describe('buildLabel / commitUrl', () => {
  test('label combines version and sha', () => {
    expect(buildLabel('0.9.0', '678f4b0')).toBe('v0.9.0 · 678f4b0')
  })

  test('commit link only for a real sha', () => {
    expect(commitUrl('678f4b0')).toBe(
      'https://github.com/daclink/pokeclicker-save-editor/commit/678f4b0',
    )
    expect(commitUrl('dev')).toBeNull()
  })
})

describe('injected constants', () => {
  test('APP_VERSION matches _version.py (Vite define wired up)', () => {
    const src = readFileSync(resolve(__dirname, '..', '..', '_version.py'), 'utf8')
    expect(APP_VERSION).toBe(parseVersionPy(src))
  })

  test('BUILD_SHA is a short sha or "dev"', () => {
    expect(BUILD_SHA).toMatch(/^([0-9a-f]{7}|dev)$/)
  })
})
