/**
 * PokeClicker version strings (`save.update.version`, data/manifest.json
 * `gameVersion`) are plain X.Y.Z. Comparison is numeric per part, so
 * 0.10.26 is newer than 0.9.99 (a string compare would say the opposite).
 */
import { describe, expect, test } from 'vitest'

import { compareGameVersions, parseGameVersion } from '../src/lib/version'

describe('parseGameVersion', () => {
  test('parses X.Y.Z into numbers', () => {
    expect(parseGameVersion('0.10.26')).toEqual([0, 10, 26])
    expect(parseGameVersion('1.0.0')).toEqual([1, 0, 0])
  })

  test('rejects anything that is not exactly X.Y.Z', () => {
    for (const bad of ['', '0.10', '0.10.26.1', 'v0.10.26', '0.10.x', ' 0.10.26', '0.10.26-beta', '-1.0.0']) {
      expect(parseGameVersion(bad), bad).toBeNull()
    }
  })
})

describe('compareGameVersions', () => {
  test('orders numerically, part by part', () => {
    expect(compareGameVersions('0.10.25', '0.10.26')).toBe(-1)
    expect(compareGameVersions('0.10.26', '0.10.26')).toBe(0)
    expect(compareGameVersions('0.10.27', '0.10.26')).toBe(1)
    expect(compareGameVersions('0.9.99', '0.10.0')).toBe(-1)
    expect(compareGameVersions('1.0.0', '0.99.99')).toBe(1)
    expect(compareGameVersions('0.10.3', '0.10.26')).toBe(-1)
  })

  test('null when either side is unparseable', () => {
    expect(compareGameVersions('garbage', '0.10.26')).toBeNull()
    expect(compareGameVersions('0.10.26', '')).toBeNull()
  })
})
