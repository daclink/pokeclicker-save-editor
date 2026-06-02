/**
 * Pure-function tests for the flutes helpers. Mirrors shards.spec.ts:
 * same `_itemList` storage location, same delete-at-0 discipline, but
 * with boolean ownership semantics on top of the underlying int values.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes } from '../src/lib/save'
import {
  KNOWN_FLUTES,
  readExtraFlutes,
  readKnownFlutes,
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
