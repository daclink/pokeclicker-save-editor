/**
 * Pure-function tests for the shards helpers.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes } from '../src/lib/save'
import {
  KNOWN_SHARD_COLORS,
  readExtraShards,
  readKnownShards,
  writeExtraShards,
  writeKnownShards,
  type ShardCounts,
} from '../src/lib/shards'

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

describe('readKnownShards', () => {
  test('returns all 16 canonical colours, defaulting absent keys to 0', () => {
    const data = loadFixture()
    const shards = readKnownShards(data)
    expect(Object.keys(shards).sort()).toEqual([...KNOWN_SHARD_COLORS].sort())
    for (const v of Object.values(shards)) {
      expect(typeof v).toBe('number')
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('writeKnownShards', () => {
  test('round-trip via readKnownShards', () => {
    const data = loadFixture()
    const edits: ShardCounts = {}
    for (const c of KNOWN_SHARD_COLORS) edits[c] = 999
    writeKnownShards(data, edits)
    const back = readKnownShards(data)
    for (const c of KNOWN_SHARD_COLORS) {
      expect(back[c], `${c}_shard should be 999`).toBe(999)
    }
  })

  test('value of 0 deletes the key from _itemList', () => {
    const data = loadFixture()
    // First seed every known colour at a non-zero count.
    const seeded: ShardCounts = {}
    for (const c of KNOWN_SHARD_COLORS) seeded[c] = 5
    writeKnownShards(data, seeded)
    // Then write 0 for one colour and confirm the key is gone.
    writeKnownShards(data, { Red: 0 })
    const items = (data.player as any)._itemList as Record<string, unknown>
    expect(items.Red_shard).toBeUndefined()
    // ...but other colours are untouched.
    expect(items.Yellow_shard).toBe(5)
  })

  test('does not touch non-shard items in _itemList', () => {
    const data = loadFixture()
    const items = (data.player as any)._itemList as Record<string, unknown>
    items['Lucky_egg'] = 7   // simulate a non-shard inventory item
    items['Pokeball'] = 100
    const all: ShardCounts = {}
    for (const c of KNOWN_SHARD_COLORS) all[c] = 9999
    writeKnownShards(data, all)
    expect(items['Lucky_egg']).toBe(7)
    expect(items['Pokeball']).toBe(100)
  })

  test('rejects negative and non-integer values', () => {
    const data = loadFixture()
    expect(() => writeKnownShards(data, { Red: -1 })).toThrow(/non-negative integer/)
    expect(() => writeKnownShards(data, { Red: 1.5 })).toThrow(/non-negative integer/)
  })

  test('ignores keys not in KNOWN_SHARD_COLORS', () => {
    const data = loadFixture()
    // Pass a typo and confirm we don't write a garbage Itemlist entry.
    writeKnownShards(data, { Sapphire: 100 } as unknown as ShardCounts)
    const items = (data.player as any)._itemList as Record<string, unknown>
    expect(items.Sapphire_shard).toBeUndefined()
  })
})

describe('extras (unrecognized *_shard keys)', () => {
  test('readExtraShards surfaces *_shard keys not in KNOWN_SHARD_COLORS', () => {
    const data = loadFixture()
    const items = (data.player as any)._itemList as Record<string, unknown>
    items['Sapphire_shard'] = 42
    items['Onyx_shard'] = 7
    items['Lucky_egg'] = 5    // non-shard — must NOT appear
    const extras = readExtraShards(data)
    expect(extras['Sapphire_shard']).toBe(42)
    expect(extras['Onyx_shard']).toBe(7)
    expect(extras['Lucky_egg']).toBeUndefined()
    expect(extras['Red_shard']).toBeUndefined()
  })

  test('writeExtraShards round-trips and deletes at 0', () => {
    const data = loadFixture()
    const items = (data.player as any)._itemList as Record<string, unknown>
    items['Sapphire_shard'] = 42
    writeExtraShards(data, { 'Sapphire_shard': 9999 })
    expect(items['Sapphire_shard']).toBe(9999)
    writeExtraShards(data, { 'Sapphire_shard': 0 })
    expect(items['Sapphire_shard']).toBeUndefined()
  })
})
