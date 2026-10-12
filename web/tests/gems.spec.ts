/**
 * Pure-function tests for the gems helpers. Mirrors shards.spec.ts but
 * targets the positional `save.gems.gemWallet` array instead of the
 * keyed `_itemList` dict.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes } from '../src/lib/save'
import {
  KNOWN_GEM_TYPES,
  readExtraGems,
  readKnownGems,
  writeExtraGems,
  writeKnownGems,
  type GemCounts,
} from '../src/lib/gems'

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

/**
 * The game's `PokemonType` enum (src/modules/enums/PokemonType.ts, v0.10.26),
 * copied by hand so this test is an independent oracle: `gemWallet[i]` is the
 * gem of type `i` (GenericDeal.ts / BagHandler.ts index it by type).
 */
const GAME_POKEMON_TYPE_ENUM: Readonly<Record<string, number>> = {
  Normal: 0, Fire: 1, Water: 2, Electric: 3, Grass: 4, Ice: 5,
  Fighting: 6, Poison: 7, Ground: 8, Flying: 9, Psychic: 10, Bug: 11,
  Rock: 12, Ghost: 13, Dragon: 14, Dark: 15, Steel: 16, Fairy: 17,
}

describe('KNOWN_GEM_TYPES', () => {
  test("matches the game's PokemonType enum position for position", () => {
    const expected = Object.entries(GAME_POKEMON_TYPE_ENUM)
      .sort(([, a], [, b]) => a - b)
      .map(([name]) => name)
    expect(KNOWN_GEM_TYPES).toEqual(expected)
  })

  test('each type writes the wallet slot the game reads for that type', () => {
    for (const [name, idx] of Object.entries(GAME_POKEMON_TYPE_ENUM)) {
      const data = loadFixture()
      writeKnownGems(data, { [name]: 12345 })
      const wallet = (data.save as any).gems.gemWallet as number[]
      expect(wallet[idx], `${name} should land in gemWallet[${idx}]`).toBe(12345)
      expect(wallet.filter((v) => v === 12345)).toHaveLength(1)
    }
  })
})

describe('readKnownGems', () => {
  test('returns all 18 canonical types, defaulting absent positions to 0', () => {
    const data = loadFixture()
    const gems = readKnownGems(data)
    expect(Object.keys(gems).sort()).toEqual([...KNOWN_GEM_TYPES].sort())
    for (const v of Object.values(gems)) {
      expect(typeof v).toBe('number')
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  test('reads positional values from the minimal fixture', () => {
    const data = loadFixture()
    const gems = readKnownGems(data)
    // Fixture seeds gemWallet[0]=10, gemWallet[1]=20, rest=0 — i.e.
    // Normal and Fire in the game's enum order.
    expect(gems.Normal).toBe(10)
    expect(gems.Fire).toBe(20)
    expect(gems.Fighting).toBe(0)
    expect(gems.Fairy).toBe(0)
  })

  test('reads a missing gems container as zeros without creating it', () => {
    const data = { save: {} } as ReturnType<typeof loadFixture>
    const gems = readKnownGems(data)
    for (const t of KNOWN_GEM_TYPES) expect(gems[t]).toBe(0)
    expect(readExtraGems(data)).toEqual({})
    expect(data.save).toEqual({})
  })
})

describe('writeKnownGems', () => {
  test('round-trip via readKnownGems', () => {
    const data = loadFixture()
    const edits: GemCounts = {}
    for (const t of KNOWN_GEM_TYPES) edits[t] = 999
    writeKnownGems(data, edits)
    const back = readKnownGems(data)
    for (const t of KNOWN_GEM_TYPES) {
      expect(back[t], `${t} gem should be 999`).toBe(999)
    }
  })

  test('zero is preserved (no array splice — positions are fixed)', () => {
    const data = loadFixture()
    writeKnownGems(data, { Normal: 0 })
    const wallet = (data.save as any).gems.gemWallet as number[]
    expect(wallet[0]).toBe(0)
    expect(wallet).toHaveLength(18)
  })

  test('rejects negative and non-integer values', () => {
    const data = loadFixture()
    expect(() => writeKnownGems(data, { Normal: -1 })).toThrow(/non-negative integer/)
    expect(() => writeKnownGems(data, { Normal: 1.5 })).toThrow(/non-negative integer/)
  })

  test('ignores keys not in KNOWN_GEM_TYPES', () => {
    const data = loadFixture()
    writeKnownGems(data, { Stellar: 100 } as unknown as GemCounts)
    const wallet = (data.save as any).gems.gemWallet as number[]
    // Only 18 positions, no 19th appended.
    expect(wallet).toHaveLength(18)
  })

  test('does not touch sibling keys under save.gems', () => {
    const data = loadFixture()
    ;(data.save as any).gems.gemUpgrades = ['some-upgrade']
    writeKnownGems(data, { Normal: 7 })
    expect((data.save as any).gems.gemUpgrades).toEqual(['some-upgrade'])
  })
})

describe('extras (wallet entries beyond index 17)', () => {
  test('readExtraGems surfaces trailing positions as Type #N', () => {
    const data = loadFixture()
    const wallet = (data.save as any).gems.gemWallet as number[]
    wallet.push(42, 7)   // simulate future PokeClicker types 18 and 19
    const extras = readExtraGems(data)
    expect(extras['Type #18']).toBe(42)
    expect(extras['Type #19']).toBe(7)
    // None of the canonical types leak into extras.
    expect(extras['Normal']).toBeUndefined()
  })

  test('readExtraGems is empty when the wallet has exactly 18 entries', () => {
    const data = loadFixture()
    expect(readExtraGems(data)).toEqual({})
  })

  test('writeExtraGems round-trips and grows the wallet as needed', () => {
    const data = loadFixture()
    writeExtraGems(data, { 'Type #18': 100, 'Type #20': 5 })
    const wallet = (data.save as any).gems.gemWallet as number[]
    // Position 19 gets auto-padded to 0 since we wrote 18 and 20.
    expect(wallet[18]).toBe(100)
    expect(wallet[19]).toBe(0)
    expect(wallet[20]).toBe(5)
  })

  test('writeExtraGems rejects malformed keys', () => {
    const data = loadFixture()
    // Doesn't match /Type #<n>/ — silently ignored, no wallet growth.
    writeExtraGems(data, { 'Lucky_egg': 7 })
    expect((data.save as any).gems.gemWallet).toHaveLength(18)
  })
})

/**
 * Readers run inside Svelte `$derived`, where writing `$state` throws
 * (state_unsafe_mutation) — so they must never create or pad anything.
 * Stripped saves exercise both the create and the pad paths.
 */
describe('readers never mutate the save', () => {
  const readers = [readKnownGems, readExtraGems]

  test('no save.gems at all', () => {
    const data = loadFixture()
    delete (data.save as any).gems
    const before = JSON.stringify(data)
    for (const read of readers) read(data)
    expect(JSON.stringify(data)).toBe(before)
  })

  test('no data.save at all', () => {
    const data = loadFixture()
    delete (data as any).save
    const before = JSON.stringify(data)
    for (const read of readers) read(data)
    expect(JSON.stringify(data)).toBe(before)
  })

  test('short wallet is not padded; missing positions read as 0', () => {
    const data = loadFixture()
    ;(data.save as any).gems.gemWallet = [1, 2, 3]
    const before = JSON.stringify(data)
    const gems = readKnownGems(data)
    expect(readExtraGems(data)).toEqual({})
    expect(JSON.stringify(data)).toBe(before)
    expect([gems.Normal, gems.Fire, gems.Water]).toEqual([1, 2, 3])
    for (const t of KNOWN_GEM_TYPES.slice(3)) expect(gems[t], t).toBe(0)
  })
})

describe('writers create/pad the wallet', () => {
  test('writeKnownGems creates save.gems.gemWallet with every known position', () => {
    const data = { save: {} } as ReturnType<typeof loadFixture>
    writeKnownGems(data, { Fire: 4 })
    const wallet = (data.save as any).gems.gemWallet as number[]
    expect(wallet).toHaveLength(KNOWN_GEM_TYPES.length)
    expect(wallet[KNOWN_GEM_TYPES.indexOf('Fire')]).toBe(4)
  })

  test('writeKnownGems pads a short wallet, keeping existing values', () => {
    const data = loadFixture()
    ;(data.save as any).gems.gemWallet = [1, 2, 3]
    writeKnownGems(data, { Fairy: 9 })
    const wallet = (data.save as any).gems.gemWallet as number[]
    expect(wallet).toHaveLength(KNOWN_GEM_TYPES.length)
    expect(wallet.slice(0, 3)).toEqual([1, 2, 3])
    expect(wallet[KNOWN_GEM_TYPES.indexOf('Fairy')]).toBe(9)
  })

  test('writeExtraGems on a save with no data.save creates the wallet', () => {
    const data = {} as ReturnType<typeof loadFixture>
    writeExtraGems(data, { 'Type #18': 5 })
    const wallet = (data.save as any).gems.gemWallet as number[]
    expect(wallet[18]).toBe(5)
    expect(wallet.slice(0, 18).every((v) => v === 0)).toBe(true)
  })
})
