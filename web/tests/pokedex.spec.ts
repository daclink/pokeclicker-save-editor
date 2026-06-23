/**
 * Pure-function tests for the Pokédex mark-caught helpers — web port of
 * pcedit_gui.PokedexTab. Marking appends minimal entries to
 * save.party.caughtPokemon; the optional stat bump mirrors _bump_stats.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes } from '../src/lib/save'
import { REGION_RANGES, statBucketFor } from '../src/lib/data'
import { caughtIdSet, markCaught, regionRows } from '../src/lib/pokedex'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'tests',
  'fixtures',
  'v0.10.25',
  'minimal.txt',
)
const load = () => decodeBytes(readFileSync(FIXTURE, 'utf8').trim())

// Fixture has exactly Charmander (#4) and Pikachu (#25) caught, both in Kanto.
const KANTO = REGION_RANGES[0]

function rawParty(data: ReturnType<typeof load>): Array<Record<string, unknown>> {
  return (data.save as any).party.caughtPokemon
}
function stats(data: ReturnType<typeof load>): Record<string, any> {
  return (data.save as any).statistics
}

describe('caughtIdSet', () => {
  test('collects the ids already in the party', () => {
    const set = caughtIdSet(load())
    expect(set.has(4)).toBe(true)
    expect(set.has(25)).toBe(true)
    expect(set.size).toBe(2)
  })
})

describe('regionRows', () => {
  test('Kanto starts at #1 and lists the whole region', () => {
    expect(KANTO.lo).toBe(1)
    const rows = regionRows(load(), KANTO)
    expect(rows.length).toBe(KANTO.hi - KANTO.lo + 1)
    expect(rows[0]).toEqual({ pid: 1, name: 'Bulbasaur', caught: false })
    expect(rows.find((r) => r.pid === 4)?.caught).toBe(true)
    expect(rows.find((r) => r.pid === 25)?.caught).toBe(true)
  })

  test('uncaughtOnly drops already-caught rows', () => {
    const rows = regionRows(load(), KANTO, true)
    expect(rows.some((r) => r.pid === 4)).toBe(false)
    expect(rows.some((r) => r.pid === 25)).toBe(false)
    expect(rows.length).toBe(KANTO.hi - KANTO.lo + 1 - 2)
  })
})

describe('markCaught', () => {
  test('appends minimal entries for uncaught ids and skips caught ones', () => {
    const data = load()
    const added = markCaught(data, [1, 2, 4]) // 4 already caught
    expect(added).toBe(2)
    const set = caughtIdSet(data)
    expect(set.has(1)).toBe(true)
    expect(set.has(2)).toBe(true)
    const entry1 = rawParty(data).find((e) => e.id === 1)
    expect(entry1).toEqual({ '2': { '0': 0, '1': 0, '2': 0 }, '3': 1, id: 1 })
  })

  test('without bumpStats, statistics is left untouched', () => {
    const data = load()
    const before = JSON.stringify(stats(data))
    markCaught(data, [1, 2, 3])
    expect(JSON.stringify(stats(data))).toBe(before)
  })

  test('with bumpStats, capture counters and totals are updated', () => {
    const data = load()
    const s0 = stats(data)
    const total0 = Number(s0.totalPokemonCaptured ?? 0)
    const male0 = Number(s0.totalMalePokemonCaptured ?? 0)
    // pids 1,2,3 are uncaught and (per gender-buckets.json) male-bucket.
    markCaught(data, [1, 2, 3], { bumpStats: true })
    const s1 = stats(data)
    expect(Number(s1.totalPokemonCaptured)).toBe(total0 + 3)
    expect(Number(s1.totalPokemonEncountered ?? 0)).toBeGreaterThanOrEqual(3)
    expect(s1.pokemonCaptured['1']).toBeGreaterThanOrEqual(1)
    expect(s1.pokemonEncountered['1']).toBeGreaterThanOrEqual(1)
    // each of 1,2,3 maps to the male bucket in the fixture's roster
    const maleAdded = [1, 2, 3].filter((p) => statBucketFor(p) === 'totalMalePokemonCaptured').length
    expect(Number(s1.totalMalePokemonCaptured)).toBe(male0 + maleAdded)
  })

  test('bumpStats only counts newly-added ids, not re-marks', () => {
    const data = load()
    const total0 = Number(stats(data).totalPokemonCaptured ?? 0)
    markCaught(data, [4, 25], { bumpStats: true }) // both already caught
    expect(Number(stats(data).totalPokemonCaptured ?? 0)).toBe(total0)
  })
})
