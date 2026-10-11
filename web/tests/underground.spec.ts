/**
 * Underground loot: treasures, plates, fossils and the Palaeontologist token
 * — plain counts in `player._itemList`, rostered from the game's
 * UndergroundItems.ts (`data/underground-items.json`). Shards, evolution
 * stones and mega stones are underground items too, but they're edited on
 * the Shards and Inventory tabs, so the Underground tab must not list them.
 */
import { describe, expect, test } from 'vitest'

import { EVOLUTION_ITEMS, MEGA_STONES, UNDERGROUND_ITEMS } from '../src/lib/data'
import { KNOWN_SHARD_COLORS } from '../src/lib/shards'
import {
  UNDERGROUND_CATEGORIES,
  UNDERGROUND_EDITED_ELSEWHERE,
  undergroundKeys,
} from '../src/lib/underground'

const keysOf = (id: string) => undergroundKeys(UNDERGROUND_CATEGORIES.find((c) => c.id === id)!)

describe('underground roster', () => {
  test('every value type is either a category here or edited on another tab', () => {
    const covered = new Set([
      ...UNDERGROUND_CATEGORIES.flatMap((c) => c.valueTypes),
      ...Object.keys(UNDERGROUND_EDITED_ELSEWHERE),
    ])
    for (const item of UNDERGROUND_ITEMS) expect(covered).toContain(item.valueType)
  })

  test('categories and the edited-elsewhere list never overlap', () => {
    for (const c of UNDERGROUND_CATEGORIES) {
      for (const vt of c.valueTypes) expect(UNDERGROUND_EDITED_ELSEWHERE).not.toHaveProperty(vt)
    }
  })

  test('items edited elsewhere really are on those tabs', () => {
    const megas = new Set(MEGA_STONES.map((m) => m.stone))
    const shards = new Set(KNOWN_SHARD_COLORS.map((c) => `${c}_shard`))
    for (const { key, valueType } of UNDERGROUND_ITEMS) {
      if (valueType === 'EvolutionItem') expect(EVOLUTION_ITEMS).toContain(key)
      if (valueType === 'MegaStone') expect(megas).toContain(key)
      if (valueType === 'Shard') expect(shards).toContain(key)
    }
  })

  test('treasures, plates, fossils and specials land in their categories', () => {
    expect(keysOf('treasures')).toContain('Rare_bone')
    expect(keysOf('treasures')).toContain('Everstone')
    expect(keysOf('plates')).toContain('Draco_plate')
    expect(keysOf('fossils')).toEqual(expect.arrayContaining(['Helix_fossil', 'Old_amber', 'Fossilized_bird']))
    expect(keysOf('special')).toEqual(['Palaeontologist_token'])
  })

  test('no key is listed by two categories, and shards/stones are listed by none', () => {
    const all = UNDERGROUND_CATEGORIES.flatMap(undergroundKeys)
    expect(new Set(all).size).toBe(all.length)
    expect(all).not.toContain('Red_shard')
    expect(all).not.toContain('Fire_stone')
    expect(all).not.toContain('Aerodactylite')
  })

  test('keys keep the game order (by underground id)', () => {
    const plates = keysOf('plates')
    expect(plates[0]).toBe('Draco_plate')
    expect(plates[plates.length - 1]).toBe('Blank_plate')
  })
})

describe('shard roster comes from the game data', () => {
  test('lists every underground shard, including Brown and Slate', () => {
    const fromGame = UNDERGROUND_ITEMS.filter((i) => i.valueType === 'Shard').map((i) => i.key)
    expect(KNOWN_SHARD_COLORS.map((c) => `${c}_shard`)).toEqual(fromGame)
    expect(KNOWN_SHARD_COLORS).toContain('Brown')
    expect(KNOWN_SHARD_COLORS).toContain('Slate')
  })

  test('drops Indigo, which is not a PokeClicker shard', () => {
    expect(KNOWN_SHARD_COLORS).not.toContain('Indigo')
  })
})
