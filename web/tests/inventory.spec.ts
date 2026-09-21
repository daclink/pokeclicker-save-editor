/**
 * Pure-function tests for the Inventory helpers (egg items, evolution items,
 * mega stones — all plain counts in `player._itemList`).
 *
 * Save semantics mirror PokeClicker's Player.ts: missing key = 0, the game
 * never persists a zero count (so writing 0 deletes the key), and a mega
 * stone is owned iff its count > 0 (the game only ever writes 1).
 */
import { describe, expect, test } from 'vitest'

import type { SaveData } from '../src/lib/save'
import {
  megaStoneBaseId,
  readItemCounts,
  readMegaStones,
  setItemCount,
  setItemCounts,
  setMegaStone,
  setMegaStones,
} from '../src/lib/inventory'
import { MEGA_STONES } from '../src/lib/data'

function makeSave(items: Record<string, number> = {}, caughtIds: number[] = []): SaveData {
  return {
    player: { _itemList: { ...items } },
    save: { party: { caughtPokemon: caughtIds.map((id) => ({ id })) } },
  }
}
const itemList = (d: SaveData) =>
  (d.player as { _itemList: Record<string, number> })._itemList

const UNRELATED = { Lucky_egg: 905, xAttack: 1242, Red_shard: 12, Meteorite_Bills_Errand: 1 }

describe('readItemCounts', () => {
  test('missing keys read as 0, present keys as their count', () => {
    const d = makeSave({ Fire_egg: 106 })
    expect(readItemCounts(d, ['Fire_egg', 'Dragon_egg'])).toEqual({
      Fire_egg: 106,
      Dragon_egg: 0,
    })
  })

  test('creates an empty _itemList when the player has none', () => {
    const d: SaveData = { player: {} }
    expect(readItemCounts(d, ['Leaf_stone'])).toEqual({ Leaf_stone: 0 })
  })
})

describe('setItemCount', () => {
  test('writes a positive count', () => {
    const d = makeSave()
    setItemCount(d, 'Leaf_stone', 5)
    expect(itemList(d).Leaf_stone).toBe(5)
  })

  test('writing 0 deletes the key (the game never saves zero counts)', () => {
    const d = makeSave({ Leaf_stone: 5 })
    setItemCount(d, 'Leaf_stone', 0)
    expect('Leaf_stone' in itemList(d)).toBe(false)
  })

  test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %s and leaves the save unchanged',
    (bad) => {
      const d = makeSave({ Leaf_stone: 5 })
      expect(() => setItemCount(d, 'Leaf_stone', bad)).toThrow(RangeError)
      expect(itemList(d).Leaf_stone).toBe(5)
    },
  )

  test('leaves unrelated items untouched', () => {
    const d = makeSave({ ...UNRELATED })
    setItemCount(d, 'Fire_egg', 3)
    setItemCount(d, 'Fire_egg', 0)
    expect(itemList(d)).toEqual(UNRELATED)
  })
})

describe('setItemCounts (bulk)', () => {
  test('applies one count to every key', () => {
    const d = makeSave({ ...UNRELATED })
    setItemCounts(d, ['Leaf_stone', 'Fire_stone'], 99)
    expect(itemList(d)).toEqual({ ...UNRELATED, Leaf_stone: 99, Fire_stone: 99 })
  })

  test('bulk 0 deletes every key', () => {
    const d = makeSave({ Leaf_stone: 1, Fire_stone: 2, ...UNRELATED })
    setItemCounts(d, ['Leaf_stone', 'Fire_stone'], 0)
    expect(itemList(d)).toEqual(UNRELATED)
  })

  test('validates before writing anything (no partial update)', () => {
    const d = makeSave({ Leaf_stone: 1 })
    expect(() => setItemCounts(d, ['Leaf_stone', 'Fire_stone'], -3)).toThrow(RangeError)
    expect(itemList(d)).toEqual({ Leaf_stone: 1 })
  })
})

describe('mega stones', () => {
  test('readMegaStones covers the whole roster with owned flags', () => {
    const d = makeSave({ Alakazite: 1, Venusaurite: 1 })
    const rows = readMegaStones(d)
    expect(rows).toHaveLength(MEGA_STONES.length)
    expect(rows.find((r) => r.stone === 'Alakazite')).toMatchObject({
      base: 'Alakazam',
      owned: true,
    })
    expect(rows.find((r) => r.stone === 'Abomasite')?.owned).toBe(false)
  })

  test('baseCaught reflects the party (exact base species id)', () => {
    const alakazam = megaStoneBaseId('Alakazam')
    expect(alakazam).toBe(65)
    const d = makeSave({}, [65, 3.01])
    const rows = readMegaStones(d)
    expect(rows.find((r) => r.stone === 'Alakazite')?.baseCaught).toBe(true)
    // Only a Venusaur *form* (3.01) is caught, not Venusaur itself.
    expect(rows.find((r) => r.stone === 'Venusaurite')?.baseCaught).toBe(false)
  })

  test('owning writes exactly 1; any positive count reads as owned', () => {
    const d = makeSave({ Gengarite: 3 })
    expect(readMegaStones(d).find((r) => r.stone === 'Gengarite')?.owned).toBe(true)
    setMegaStone(d, 'Abomasite', true)
    expect(itemList(d).Abomasite).toBe(1)
  })

  test('un-owning deletes the key; repeated calls are idempotent', () => {
    const d = makeSave({ Abomasite: 1 })
    setMegaStone(d, 'Abomasite', false)
    setMegaStone(d, 'Abomasite', false)
    expect('Abomasite' in itemList(d)).toBe(false)
    setMegaStone(d, 'Abomasite', true)
    setMegaStone(d, 'Abomasite', true)
    expect(itemList(d).Abomasite).toBe(1)
  })

  test('rejects names that are not mega stones', () => {
    const d = makeSave()
    expect(() => setMegaStone(d, 'Lucky_egg', true)).toThrow(RangeError)
    expect(() => setMegaStones(d, ['Alakazite', 'Nope'], true)).toThrow(RangeError)
    expect(itemList(d)).toEqual({}) // nothing partially written
  })

  test('bulk give/remove leaves unrelated items untouched', () => {
    const d = makeSave({ ...UNRELATED })
    const all = MEGA_STONES.map((m) => m.stone)
    setMegaStones(d, all, true)
    for (const s of all) expect(itemList(d)[s]).toBe(1)
    setMegaStones(d, all, false)
    expect(itemList(d)).toEqual(UNRELATED)
  })
})
