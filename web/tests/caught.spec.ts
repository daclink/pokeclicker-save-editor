/**
 * Pure-function tests for the caught-pokémon helpers.
 *
 * Key mapping is the canonical PokeClicker PartyPokemonSaveKeys:
 *   0 attackBonusPercent, 1 attackBonusAmount, 2 vitaminsUsed, 3 exp,
 *   4 breeding, 5 shiny, 8 pokerus, 9 effortPoints.
 *
 * Particular focus on (a) pokerus living at key "8" (NOT "1"), (b) shiny at
 * key "5", and (c) the key-present-iff-true rule for inEgg/shiny — a
 * regression there would break byte-identity round-trips against real saves
 * that have never had those flags set.
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
  setCaughtShiny,
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
      expect(typeof r.pokerus).toBe('number')
      expect(typeof r.exp).toBe('number')
      expect(typeof r.inEgg).toBe('boolean')
      expect(typeof r.shiny).toBe('boolean')
    }
  })

  test('name lookup uses national-dex names', () => {
    const rows = readCaughtRows(loadFixture())
    // Fixture has Charmander (#4) and Pikachu (#25).
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get(4)?.name).toBe('Charmander')
    expect(byId.get(25)?.name).toBe('Pikachu')
  })

  test('pokerus reads key "8" (state), never "1" (attackBonusAmount)', () => {
    // Regression: the editor previously read pokerus from key "1", surfacing
    // large attackBonusAmount values as "pokerus". Pokerus lives at key "8".
    const data = loadFixture()
    const e = rawEntry(data, 4)
    e['1'] = 2046 // attackBonusAmount — a big number that must NOT be pokerus
    e['8'] = 2 // real pokerus = Contagious
    const row = readCaughtRows(data).find((r) => r.id === 4)!
    expect(row.pokerus).toBe(2)
  })

  test('shiny reads key "5"', () => {
    const data = loadFixture()
    rawEntry(data, 25)['5'] = true
    const row = readCaughtRows(data).find((r) => r.id === 25)!
    expect(row.shiny).toBe(true)
  })
})

describe('setCaughtEntry', () => {
  test('numeric fields round-trip to canonical keys', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { atkBonus: 100, pokerus: 3, exp: 1234567 })
    expect(rawEntry(data, 4)['0']).toBe(100) // attackBonusPercent
    expect(rawEntry(data, 4)['8']).toBe(3) // pokerus -> key "8", not "1"
    expect(rawEntry(data, 4)['3']).toBe(1234567)
    const row = readCaughtRows(data).find((r) => r.id === 4)!
    expect(row.atkBonus).toBe(100)
    expect(row.pokerus).toBe(3)
    expect(row.exp).toBe(1234567)
  })

  test('pokerus rejects values outside 0..3', () => {
    const data = loadFixture()
    expect(() => setCaughtEntry(data, 4, { pokerus: 4 })).toThrow(/pokerus/)
    expect(() => setCaughtEntry(data, 4, { pokerus: -1 })).toThrow(/pokerus/)
    expect(() => setCaughtEntry(data, 4, { pokerus: 1.5 })).toThrow(/pokerus/)
  })

  test('inEgg=true sets the "4" key; inEgg=false deletes it', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { inEgg: true })
    expect(rawEntry(data, 4)['4']).toBe(true)
    setCaughtEntry(data, 4, { inEgg: false })
    expect('4' in rawEntry(data, 4)).toBe(false)
  })

  test('shiny=true sets the "5" key; shiny=false deletes it', () => {
    const data = loadFixture()
    setCaughtEntry(data, 25, { shiny: true })
    expect(rawEntry(data, 25)['5']).toBe(true)
    setCaughtEntry(data, 25, { shiny: false })
    expect('5' in rawEntry(data, 25)).toBe(false)
  })

  test('preserves untouched fields and the vitamins sub-dict', () => {
    const data = loadFixture()
    const before = { ...rawEntry(data, 4) }
    setCaughtEntry(data, 4, { atkBonus: 50 })
    const after = rawEntry(data, 4)
    expect(after['1']).toBe(before['1']) // attackBonusAmount untouched
    expect(after['2']).toEqual(before['2']) // vitamins untouched
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
  test('setCaughtShiny true sets key "5", false deletes it', () => {
    const data = loadFixture()
    setCaughtShiny(data, [4, 25], true)
    expect(rawEntry(data, 4)['5']).toBe(true)
    expect(rawEntry(data, 25)['5']).toBe(true)
    setCaughtShiny(data, [4, 25], false)
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
