/**
 * Pure-function tests for the flutes helpers. Mirrors shards.spec.ts:
 * same `_itemList` storage location, same delete-at-0 discipline, but
 * with boolean ownership semantics on top of the underlying int values.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes, type SaveData } from '../src/lib/save'
import {
  FLUTE_STATE,
  KNOWN_FLUTES,
  readExtraFlutes,
  readFluteStatus,
  readKnownFlutes,
  repairDuplicateFlutes,
  writeExtraFlutes,
  writeKnownFlutes,
  type FluteOwnership,
} from '../src/lib/flutes'

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

describe('readKnownFlutes', () => {
  test('returns all 6 canonical flutes, defaulting absent keys to false', () => {
    const data = loadFixture()
    const flutes = readKnownFlutes(data)
    expect(Object.keys(flutes).sort()).toEqual([...KNOWN_FLUTES].sort())
    for (const v of Object.values(flutes)) expect(typeof v).toBe('boolean')
  })

  test('treats any non-zero numeric value as owned', () => {
    const data = loadFixture()
    const items = (data.player as any)._itemList as Record<string, unknown>
    items.Yellow_Flute = 1   // canonical "owned"
    items.Black_Flute = 5    // accommodate the cmd_berry-style int drift
    items.Red_Flute = 0      // explicit 0 → not owned (and a real save wouldn't keep this)
    const flutes = readKnownFlutes(data)
    expect(flutes.Yellow).toBe(true)
    expect(flutes.Black).toBe(true)
    expect(flutes.Red).toBe(false)
    expect(flutes.Blue).toBe(false)   // absent key
  })
})

describe('writeKnownFlutes', () => {
  test('true writes <Name>_Flute = 1; round-trips via readKnownFlutes', () => {
    const data = loadFixture()
    const edits: FluteOwnership = {}
    for (const n of KNOWN_FLUTES) edits[n] = true
    writeKnownFlutes(data, edits)
    const back = readKnownFlutes(data)
    const items = (data.player as any)._itemList as Record<string, unknown>
    for (const n of KNOWN_FLUTES) {
      expect(back[n]).toBe(true)
      expect(items[`${n}_Flute`]).toBe(1)
    }
  })

  test('false deletes the key from _itemList', () => {
    const data = loadFixture()
    // Seed all flutes as owned, then drop one.
    const seeded: FluteOwnership = {}
    for (const n of KNOWN_FLUTES) seeded[n] = true
    writeKnownFlutes(data, seeded)
    writeKnownFlutes(data, { Yellow: false })
    const items = (data.player as any)._itemList as Record<string, unknown>
    expect(items.Yellow_Flute).toBeUndefined()
    expect(items.Black_Flute).toBe(1)   // siblings untouched
  })

  test('does not touch non-flute items in _itemList', () => {
    const data = loadFixture()
    const items = (data.player as any)._itemList as Record<string, unknown>
    items.Lucky_egg = 7
    items.Red_shard = 100
    const all: FluteOwnership = {}
    for (const n of KNOWN_FLUTES) all[n] = true
    writeKnownFlutes(data, all)
    expect(items.Lucky_egg).toBe(7)
    expect(items.Red_shard).toBe(100)
  })

  test('ignores names not in KNOWN_FLUTES', () => {
    const data = loadFixture()
    writeKnownFlutes(data, { Sapphire: true } as unknown as FluteOwnership)
    const items = (data.player as any)._itemList as Record<string, unknown>
    expect(items.Sapphire_Flute).toBeUndefined()
  })
})

describe('extras (*_Flute keys outside KNOWN_FLUTES)', () => {
  test('readExtraFlutes surfaces future-flute keys', () => {
    const data = loadFixture()
    const items = (data.player as any)._itemList as Record<string, unknown>
    // Simulate the commented-out flutes ever being enabled.
    items.Poke_Flute = 1
    items.Sun_Flute = 1
    items.Lucky_egg = 5   // non-flute — must NOT appear
    const extras = readExtraFlutes(data)
    expect(extras.Poke_Flute).toBe(1)
    expect(extras.Sun_Flute).toBe(1)
    expect(extras.Lucky_egg).toBeUndefined()
    expect(extras.Yellow_Flute).toBeUndefined()
  })

  test('writeExtraFlutes round-trips and deletes at 0', () => {
    const data = loadFixture()
    const items = (data.player as any)._itemList as Record<string, unknown>
    items.Poke_Flute = 1
    writeExtraFlutes(data, { Poke_Flute: 3 })   // future cap might be > 1
    expect(items.Poke_Flute).toBe(3)
    writeExtraFlutes(data, { Poke_Flute: 0 })
    expect(items.Poke_Flute).toBeUndefined()
  })

  test('writeExtraFlutes rejects negative and non-integer values', () => {
    const data = loadFixture()
    expect(() => writeExtraFlutes(data, { Poke_Flute: -1 })).toThrow(/non-negative integer/)
    expect(() => writeExtraFlutes(data, { Poke_Flute: 1.5 })).toThrow(/non-negative integer/)
  })
})

// --- active flutes (player.effectList) -------------------------------------
//
// While a flute is running the game moves it out of `_itemList` into
// `player.effectList[<Name>_Flute]` (a gem budget that ticks down;
// FluteEffectRunner.ts). Turning it off calls `player.gainItem(name, 1)`.

/** Gem budget the real save carries for a long-running flute. */
const LONG_BUDGET = 9.0e13
/** A non-flute battle-item effect that shares `effectList`. */
const X_ATTACK_SECONDS = 30

const mixedItems = () => ({ Black_Flute: 1, Blue_Flute: 1, Lucky_egg: 7 })
const mixedEffects = () => ({
  Yellow_Flute: LONG_BUDGET,
  Time_Flute: LONG_BUDGET,
  Red_Flute: LONG_BUDGET,
  White_Flute: LONG_BUDGET,
  xAttack: X_ATTACK_SECONDS,
})

/**
 * Mirrors the real save's shape: Yellow/Time/Red/White running, only
 * Black and Blue in `_itemList`, plus a non-flute battle-item effect.
 */
function mixedSave(): SaveData {
  return { player: { _itemList: mixedItems(), effectList: mixedEffects() }, save: {} }
}

const itemsOf = (d: SaveData) => (d.player as any)._itemList as Record<string, unknown>
const effectsOf = (d: SaveData) => (d.player as any).effectList as Record<string, unknown>

describe('readFluteStatus', () => {
  test('active-only and owned-only flutes map to their states', () => {
    const { states, duplicates } = readFluteStatus(mixedSave())
    expect(states).toEqual({
      Yellow: FLUTE_STATE.Active,
      Black: FLUTE_STATE.Owned,
      Time: FLUTE_STATE.Active,
      Red: FLUTE_STATE.Active,
      White: FLUTE_STATE.Active,
      Blue: FLUTE_STATE.Owned,
    })
    expect(duplicates).toEqual([])
  })

  test('a flute in neither place is not-owned', () => {
    const data: SaveData = { player: { _itemList: {}, effectList: {} }, save: {} }
    const { states } = readFluteStatus(data)
    expect(Object.keys(states)).toEqual([...KNOWN_FLUTES])
    for (const s of Object.values(states)) expect(s).toBe(FLUTE_STATE.NotOwned)
  })

  test('effectList value 0 is not active', () => {
    const data: SaveData = { player: { _itemList: {}, effectList: { Yellow_Flute: 0 } }, save: {} }
    expect(readFluteStatus(data).states.Yellow).toBe(FLUTE_STATE.NotOwned)
  })

  test('non-number or negative effectList values are not active', () => {
    const data: SaveData = {
      player: {
        _itemList: { Black_Flute: 1 },
        effectList: { Yellow_Flute: 'lots', Black_Flute: null, Time_Flute: true, Red_Flute: -5 },
      },
      save: {},
    }
    const { states } = readFluteStatus(data)
    expect(states.Yellow).toBe(FLUTE_STATE.NotOwned)
    expect(states.Black).toBe(FLUTE_STATE.Owned)
    expect(states.Time).toBe(FLUTE_STATE.NotOwned)
    expect(states.Red).toBe(FLUTE_STATE.NotOwned)
  })

  test('active AND in _itemList is reported active and listed as a duplicate', () => {
    const data = mixedSave()
    itemsOf(data).Yellow_Flute = 1
    itemsOf(data).Red_Flute = 1
    const { states, duplicates } = readFluteStatus(data)
    expect(states.Yellow).toBe(FLUTE_STATE.Active)
    expect(states.Red).toBe(FLUTE_STATE.Active)
    expect(duplicates).toEqual(['Yellow', 'Red'])
  })

  test('readKnownFlutes counts an active flute as owned', () => {
    const owned = readKnownFlutes(mixedSave())
    for (const n of KNOWN_FLUTES) expect(owned[n]).toBe(true)
  })
})

describe('writeKnownFlutes with active flutes', () => {
  test('Give on an active flute does not add an _itemList copy', () => {
    const data = mixedSave()
    writeKnownFlutes(data, { Yellow: true })
    expect('Yellow_Flute' in itemsOf(data)).toBe(false)
    expect(effectsOf(data).Yellow_Flute).toBe(LONG_BUDGET)
  })

  test('Give on an active, duplicated flute removes the extra copy', () => {
    const data = mixedSave()
    itemsOf(data).Yellow_Flute = 1
    writeKnownFlutes(data, { Yellow: true })
    expect('Yellow_Flute' in itemsOf(data)).toBe(false)
    expect(effectsOf(data).Yellow_Flute).toBe(LONG_BUDGET)
    expect(readFluteStatus(data).duplicates).toEqual([])
  })

  test('Remove on an active flute deletes both keys and leaves other effects alone', () => {
    const data = mixedSave()
    itemsOf(data).Red_Flute = 1
    writeKnownFlutes(data, { Red: false })
    expect('Red_Flute' in itemsOf(data)).toBe(false)
    expect('Red_Flute' in effectsOf(data)).toBe(false)
    expect(effectsOf(data).xAttack).toBe(X_ATTACK_SECONDS)
    expect(effectsOf(data).Yellow_Flute).toBe(LONG_BUDGET)
    expect(readFluteStatus(data).states.Red).toBe(FLUTE_STATE.NotOwned)
  })

  test('Give all on the mixed save: active stay active, nothing duplicated', () => {
    const data = mixedSave()
    const all: FluteOwnership = {}
    for (const n of KNOWN_FLUTES) all[n] = true
    writeKnownFlutes(data, all)
    expect(itemsOf(data)).toEqual(mixedItems())
    expect(effectsOf(data)).toEqual(mixedEffects())
    expect(readFluteStatus(data).duplicates).toEqual([])
  })

  test('Give all on a save with nothing owned writes every flute to _itemList', () => {
    const data: SaveData = { player: { _itemList: {}, effectList: { xAttack: X_ATTACK_SECONDS } }, save: {} }
    const all: FluteOwnership = {}
    for (const n of KNOWN_FLUTES) all[n] = true
    writeKnownFlutes(data, all)
    for (const n of KNOWN_FLUTES) expect(itemsOf(data)[`${n}_Flute`]).toBe(1)
    expect(effectsOf(data)).toEqual({ xAttack: X_ATTACK_SECONDS })
  })

  test('Remove all on the mixed save: nothing owned or active, xAttack kept', () => {
    const data = mixedSave()
    const none: FluteOwnership = {}
    for (const n of KNOWN_FLUTES) none[n] = false
    writeKnownFlutes(data, none)
    expect(itemsOf(data)).toEqual({ Lucky_egg: 7 })
    expect(effectsOf(data)).toEqual({ xAttack: X_ATTACK_SECONDS })
  })

  test('never creates player.effectList', () => {
    const data: SaveData = { player: { _itemList: {} }, save: {} }
    const none: FluteOwnership = {}
    for (const n of KNOWN_FLUTES) none[n] = false
    writeKnownFlutes(data, none)
    writeKnownFlutes(data, { Yellow: true })
    repairDuplicateFlutes(data)
    expect('effectList' in (data.player as object)).toBe(false)
    expect(itemsOf(data).Yellow_Flute).toBe(1)
  })
})

describe('repairDuplicateFlutes', () => {
  test('drops the _itemList copy of active flutes only', () => {
    const data = mixedSave()
    itemsOf(data).Yellow_Flute = 1
    itemsOf(data).White_Flute = 2
    repairDuplicateFlutes(data)
    expect(itemsOf(data)).toEqual(mixedItems())
    expect(effectsOf(data)).toEqual(mixedEffects())
  })

  test('is a no-op without duplicates', () => {
    const data = mixedSave()
    const before = JSON.stringify(data)
    repairDuplicateFlutes(data)
    expect(JSON.stringify(data)).toBe(before)
  })
})

describe('readers do not mutate the save', () => {
  test('a save without _itemList or effectList is unchanged by every read', () => {
    const data: SaveData = { player: { name: 'Red' }, save: {} }
    const before = JSON.stringify(data)
    const owned = readKnownFlutes(data)
    const extras = readExtraFlutes(data)
    const status = readFluteStatus(data)
    expect(JSON.stringify(data)).toBe(before)
    for (const n of KNOWN_FLUTES) expect(owned[n]).toBe(false)
    expect(extras).toEqual({})
    for (const s of Object.values(status.states)) expect(s).toBe(FLUTE_STATE.NotOwned)
  })

  test('a save without player is unchanged by every read', () => {
    const data: SaveData = { save: {} }
    const before = JSON.stringify(data)
    readKnownFlutes(data)
    readExtraFlutes(data)
    readFluteStatus(data)
    expect(JSON.stringify(data)).toBe(before)
  })
})
