import { describe, expect, test } from 'vitest'
import { SECTIONS } from '../src/lib/sections'

describe('SECTIONS', () => {
  test('lists the eight editor sections in order', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      'currencies',
      'eggs',
      'shards',
      'gems',
      'flutes',
      'berries',
      'caught',
      'pokedex',
    ])
  })

  test('every section has a non-empty label and icon', () => {
    for (const s of SECTIONS) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.icon.length).toBeGreaterThan(0)
    }
  })

  test('ids are unique', () => {
    const ids = SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
