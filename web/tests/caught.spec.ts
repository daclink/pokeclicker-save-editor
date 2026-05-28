/**
 * Pure-function tests for the caught-pokémon helpers.
 *
 * Particular focus on the key-present-iff-true rule for inEgg/resistant —
 * a regression here would break byte-identity round-trips against real
 * saves that have never had those flags set.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes } from '../src/lib/save'
import {
  readCaughtRows,
  setCaughtAtkBonus,
  setCaughtEntry,
  setCaughtInEgg,
  setCaughtResistant,
} from '../src/lib/caught'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'tests',
  'fixtures',
  'v0.10.25',
  'minimal.txt',
)

const loadFixture = () => decodeBytes(readFileSync(FIXTURE, 'utf8').trim())

// Convenience: pull the raw save-side entry for a given id so we can check
// for actual key presence (not just truthiness).
function rawEntry(data: ReturnType<typeof loadFixture>, id: number): Record<string, unknown> {
  const list = (data.save as any).party.caughtPokemon as Array<Record<string, unknown>>
  const e = list.find((x) => x?.id === id)
  if (!e) throw new Error(`no entry with id ${id} in fixture`)
  return e
}

describe('readCaughtRows', () => {
  test('returns one row per caught pokémon with name lookups', () => {
    const rows = readCaughtRows(loadFixture())
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(typeof r.id).toBe('number')
      expect(typeof r.name).toBe('string')
      expect(r.name.length).toBeGreaterThan(0)
      expect(typeof r.atkBonus).toBe('number')
      expect(typeof r.exp).toBe('number')
      expect(typeof r.inEgg).toBe('boolean')
      expect(typeof r.resistant).toBe('boolean')
    }
  })

  test('name lookup uses national-dex names', () => {
    const rows = readCaughtRows(loadFixture())
    // Fixture has Charmander (#4) and Pikachu (#25).
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get(4)?.name).toBe('Charmander')
    expect(byId.get(25)?.name).toBe('Pikachu')
  })
})

describe('setCaughtEntry', () => {
  test('numeric fields round-trip', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { atkBonus: 100, pokerus: 3, exp: 1234567 })
    const row = readCaughtRows(data).find((r) => r.id === 4)!
    expect(row.atkBonus).toBe(100)
    expect(row.pokerus).toBe(3)
    expect(row.exp).toBe(1234567)
  })

  test('inEgg=true sets the "4" key; inEgg=false deletes it', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { inEgg: true })
    expect(rawEntry(data, 4)['4']).toBe(true)
    setCaughtEntry(data, 4, { inEgg: false })
    expect('4' in rawEntry(data, 4)).toBe(false)
  })

  test('resistant=true sets the "5" key; resistant=false deletes it', () => {
    const data = loadFixture()
    setCaughtEntry(data, 25, { resistant: true })
    expect(rawEntry(data, 25)['5']).toBe(true)
    setCaughtEntry(data, 25, { resistant: false })
    expect('5' in rawEntry(data, 25)).toBe(false)
  })

  test('preserves untouched fields and the EVs sub-dict', () => {
    const data = loadFixture()
    const before = { ...rawEntry(data, 4) }
    setCaughtEntry(data, 4, { atkBonus: 50 })
    const after = rawEntry(data, 4)
    expect(after['1']).toBe(before['1']) // pokerus untouched
    expect(after['2']).toEqual(before['2']) // EVs untouched
    expect(after['3']).toBe(before['3']) // exp untouched
  })

  test('throws on unknown id', () => {
    const data = loadFixture()
    expect(() => setCaughtEntry(data, 99999, { atkBonus: 0 })).toThrow(/no caught/)
  })

  test('rejects negative or non-integer numerics', () => {
    const data = loadFixture()
    expect(() => setCaughtEntry(data, 4, { atkBonus: -1 })).toThrow(/non-negative integer/)
    expect(() => setCaughtEntry(data, 4, { exp: 1.5 })).toThrow(/non-negative integer/)
  })
})

describe('quick-action bulk helpers', () => {
  test('setCaughtResistant true sets the key, false deletes it', () => {
    const data = loadFixture()
    setCaughtResistant(data, [4, 25], true)
    expect(rawEntry(data, 4)['5']).toBe(true)
    expect(rawEntry(data, 25)['5']).toBe(true)
    setCaughtResistant(data, [4, 25], false)
    expect('5' in rawEntry(data, 4)).toBe(false)
    expect('5' in rawEntry(data, 25)).toBe(false)
  })

  test('setCaughtInEgg true sets the key, false deletes it', () => {
    const data = loadFixture()
    setCaughtInEgg(data, [4], true)
    expect(rawEntry(data, 4)['4']).toBe(true)
    setCaughtInEgg(data, [4], false)
    expect('4' in rawEntry(data, 4)).toBe(false)
  })

  test('setCaughtAtkBonus writes to all listed ids', () => {
    const data = loadFixture()
    setCaughtAtkBonus(data, [4, 25], 100)
    const rows = readCaughtRows(data)
    expect(rows.find((r) => r.id === 4)?.atkBonus).toBe(100)
    expect(rows.find((r) => r.id === 25)?.atkBonus).toBe(100)
  })

  test('quick-action helpers tolerate ids missing from the save', () => {
    const data = loadFixture()
    // Mix valid and invalid; the valid id should still be written.
    setCaughtAtkBonus(data, [4, 99999], 25)
    expect(rawEntry(data, 4)['0']).toBe(25)
  })

  test('setCaughtAtkBonus rejects negative / non-integer', () => {
    const data = loadFixture()
    expect(() => setCaughtAtkBonus(data, [4], -1)).toThrow(/non-negative integer/)
    expect(() => setCaughtAtkBonus(data, [4], 1.5)).toThrow(/non-negative integer/)
  })
})
