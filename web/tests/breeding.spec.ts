/**
 * Pure-function tests for the breeding/eggs helpers.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes } from '../src/lib/save'
import {
  addEgg,
  clearEgg,
  DEFAULT_NEW_EGG,
  EGG_TYPE,
  EGG_TYPE_LABELS,
  eggPokemonError,
  EMPTY_EGG,
  MAX_EGG_SLOTS,
  QUICK_ADD_TOTAL_STEPS,
  SHINY_CHANCE_BREEDING,
  type Egg,
  hatchEgg,
  quickAddEgg,
  QUICK_ADD_PRESETS,
  readEggs,
  readEggSlots,
  removeEgg,
  setEgg,
  writeEggSlots,
  eggTypeLabel,
} from '../src/lib/breeding'
import { NATIONAL_NAMES, POKEMON_FORMS } from '../src/lib/data'

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

/** A non-empty egg that occupies a slot. */
const fullEgg = (pokemon: number): Egg => ({ ...DEFAULT_NEW_EGG, pokemon })

/** Replace the fixture's eggList (and eggSlots) wholesale. */
function setList(data: ReturnType<typeof loadFixture>, eggs: Egg[], slots = eggs.length): void {
  const b = (data.save as any).breeding
  b.eggList = eggs
  b.eggSlots = slots
}

/** Four occupied slots — the game's maximum. */
const fourFull = (): Egg[] => [fullEgg(1), fullEgg(4), fullEgg(7), fullEgg(25)]

describe('breeding read', () => {
  test('readEggSlots returns the configured slot count', () => {
    const data = loadFixture()
    expect(readEggSlots(data)).toBeTypeOf('number')
  })

  test('readEggs returns the eggList', () => {
    const data = loadFixture()
    const eggs = readEggs(data)
    expect(Array.isArray(eggs)).toBe(true)
    // Fixture has two slots seeded with sample eggs.
    expect(eggs.length).toBeGreaterThan(0)
    expect(eggs[0]).toHaveProperty('type')
    expect(eggs[0]).toHaveProperty('pokemon')
    expect(eggs[0]).toHaveProperty('steps')
    expect(eggs[0]).toHaveProperty('totalSteps')
  })
})

describe('eggSlots write', () => {
  test('writeEggSlots stores the value', () => {
    const data = loadFixture()
    writeEggSlots(data, 4)
    expect(readEggSlots(data)).toBe(4)
  })

  test('writeEggSlots rejects negative / non-integer', () => {
    const data = loadFixture()
    expect(() => writeEggSlots(data, -1)).toThrow(/non-negative integer/)
    expect(() => writeEggSlots(data, 1.5)).toThrow(/non-negative integer/)
  })

  test('writeEggSlots accepts the game maximum and rejects anything above it', () => {
    const data = loadFixture()
    writeEggSlots(data, MAX_EGG_SLOTS)
    expect(readEggSlots(data)).toBe(MAX_EGG_SLOTS)
    expect(() => writeEggSlots(data, MAX_EGG_SLOTS + 1)).toThrow(RangeError)
    expect(() => writeEggSlots(data, 5)).toThrow(/at most 4/)
    expect(readEggSlots(data)).toBe(MAX_EGG_SLOTS)
  })
})

describe('hatchEgg', () => {
  test('sets steps to totalSteps', () => {
    const data = loadFixture()
    const eggs = readEggs(data)
    const before = eggs[0].totalSteps
    hatchEgg(data, 0)
    expect(eggs[0].steps).toBe(before)
  })

  test('throws when index is out of range', () => {
    const data = loadFixture()
    const eggs = readEggs(data)
    expect(() => hatchEgg(data, eggs.length + 5)).toThrow(/no egg at index/)
  })
})

describe('clearEgg', () => {
  test('replaces the slot with EMPTY_EGG', () => {
    const data = loadFixture()
    clearEgg(data, 0)
    expect(readEggs(data)[0]).toEqual(EMPTY_EGG)
  })

  test('preserves other slots', () => {
    const data = loadFixture()
    const before = { ...readEggs(data)[1] }
    clearEgg(data, 0)
    expect(readEggs(data)[1]).toEqual(before)
  })
})

describe('removeEgg', () => {
  test('leaves the slot in place as an empty egg (list length unchanged)', () => {
    const data = loadFixture()
    const before = readEggs(data).length
    removeEgg(data, 0)
    expect(readEggs(data).length).toBe(before)
    expect(readEggs(data)[0]).toEqual(EMPTY_EGG)
  })

  test('does not shift later eggs to other slot indexes', () => {
    const data = loadFixture()
    setList(data, fourFull())
    removeEgg(data, 1)
    const eggs = readEggs(data)
    expect(eggs.map((e) => e.pokemon)).toEqual([1, 0, 7, 25])
    expect(eggs[1].type).toBe(EGG_TYPE.None)
  })

  test('rejects out-of-range index', () => {
    const data = loadFixture()
    expect(() => removeEgg(data, 999)).toThrow(/out of range/)
  })
})

describe('addEgg', () => {
  test('fills the first empty slot with DEFAULT_NEW_EGG', () => {
    const data = loadFixture()
    // Fixture: slot 0 full, slot 1 empty.
    const before = readEggs(data).length
    const idx = addEgg(data)
    expect(idx).toBe(1)
    expect(readEggs(data).length).toBe(before)
    expect(readEggs(data)[1]).toEqual(DEFAULT_NEW_EGG)
  })

  test('appends when the list is shorter than the cap and bumps eggSlots', () => {
    const data = loadFixture()
    setList(data, [fullEgg(1), fullEgg(4)])
    expect(addEgg(data)).toBe(2)
    expect(addEgg(data)).toBe(3)
    expect(readEggs(data).length).toBe(MAX_EGG_SLOTS)
    expect(readEggSlots(data)).toBe(MAX_EGG_SLOTS)
  })

  test('refuses when all 4 slots are full: returns null, list and eggSlots unchanged', () => {
    const data = loadFixture()
    setList(data, fourFull())
    const snapshot = JSON.stringify(readEggs(data))
    expect(addEgg(data)).toBeNull()
    expect(JSON.stringify(readEggs(data))).toBe(snapshot)
    expect(readEggSlots(data)).toBe(MAX_EGG_SLOTS)
  })

  test('never uses an empty slot past index 3 (legacy oversize list)', () => {
    const data = loadFixture()
    setList(data, [...fourFull(), { ...EMPTY_EGG }], MAX_EGG_SLOTS)
    expect(addEgg(data)).toBeNull()
    expect(readEggs(data)[4]).toEqual(EMPTY_EGG)
  })
})

describe('setEgg', () => {
  test('replaces the slot with the given egg', () => {
    const data = loadFixture()
    const custom = { ...DEFAULT_NEW_EGG, pokemon: 25, totalSteps: 7500 }
    setEgg(data, 0, custom)
    expect(readEggs(data)[0]).toEqual(custom)
  })

  test('rejects out-of-range index', () => {
    const data = loadFixture()
    expect(() => setEgg(data, 999, { ...DEFAULT_NEW_EGG })).toThrow(/out of range/)
  })
})

describe('QUICK_ADD_PRESETS', () => {
  test('are species eggs of type EggItem, like shop eggs', () => {
    for (const preset of QUICK_ADD_PRESETS) {
      expect(preset.template.type).toBe(EGG_TYPE.EggItem)
      expect(preset.template.totalSteps).toBe(QUICK_ADD_TOTAL_STEPS)
    }
  })

  test('name a real species in their label', () => {
    expect(QUICK_ADD_PRESETS.map((p) => [p.label, p.template.pokemon])).toEqual([
      ['Bulbasaur egg', 1],
      ['Charmander egg', 4],
      ['Squirtle egg', 7],
      ['Dratini egg', 147],
      ['Eevee egg', 133],
    ])
    for (const p of QUICK_ADD_PRESETS) {
      expect(NATIONAL_NAMES[p.template.pokemon - 1]).toBe(p.label.replace(/ egg$/, ''))
    }
  })
})

describe('quickAddEgg', () => {
  test('fills the first empty slot when one exists', () => {
    const data = loadFixture()
    // Force-clear slot 0 so we have a known empty target.
    clearEgg(data, 0)
    const idx = quickAddEgg(data, QUICK_ADD_PRESETS[0]) // Bulbasaur
    expect(idx).toBe(0)
    const eggs = readEggs(data)
    expect(eggs[0].type).toBe(EGG_TYPE.EggItem)
    expect(eggs[0].pokemon).toBe(1)
    expect(eggs[0].steps).toBe(0)
    expect(eggs[0].totalSteps).toBe(QUICK_ADD_TOTAL_STEPS)
    expect(eggs[0].shinyChance).toBe(SHINY_CHANCE_BREEDING)
  })

  test('appends when the list is shorter than 4 and bumps eggSlots', () => {
    const data = loadFixture()
    setList(data, [fullEgg(1), fullEgg(4)])
    const idx = quickAddEgg(data, QUICK_ADD_PRESETS[3]) // Dratini
    expect(idx).toBe(2)
    expect(readEggs(data).length).toBe(3)
    expect(readEggSlots(data)).toBe(3)
  })

  test('refuses when all 4 slots are full: returns null, list and eggSlots unchanged', () => {
    const data = loadFixture()
    setList(data, fourFull())
    const snapshot = JSON.stringify(readEggs(data))
    expect(quickAddEgg(data, QUICK_ADD_PRESETS[3])).toBeNull()
    expect(JSON.stringify(readEggs(data))).toBe(snapshot)
    expect(readEggs(data).length).toBe(MAX_EGG_SLOTS)
    expect(readEggSlots(data)).toBe(MAX_EGG_SLOTS)
  })

  test('never raises eggSlots above the cap', () => {
    const data = loadFixture()
    setList(data, [fullEgg(1), fullEgg(4), fullEgg(7)], 3)
    expect(quickAddEgg(data, QUICK_ADD_PRESETS[0])).toBe(3)
    expect(quickAddEgg(data, QUICK_ADD_PRESETS[0])).toBeNull()
    expect(readEggSlots(data)).toBe(MAX_EGG_SLOTS)
    expect(readEggs(data).length).toBe(MAX_EGG_SLOTS)
  })
})

describe('EGG_TYPE', () => {
  test('mirrors the game enum EggType { None = -1, Pokemon, EggItem }', () => {
    expect(EGG_TYPE).toEqual({ None: -1, Pokemon: 0, EggItem: 1 })
  })

  test('labels exist for exactly the three real values', () => {
    expect(Object.keys(EGG_TYPE_LABELS).map(Number).sort()).toEqual([-1, 0, 1])
  })
})

describe('eggTypeLabel', () => {
  test('known labels', () => {
    expect(eggTypeLabel(-1)).toBe('Empty')
    expect(eggTypeLabel(0)).toBe('Pokémon')
    expect(eggTypeLabel(1)).toBe('Egg item')
  })

  test('legacy / unknown values are labelled Unknown (#n)', () => {
    // 2–8 were written by older editor versions ("Water" … "Fossil").
    expect(eggTypeLabel(3)).toBe('Unknown (#3)')
    expect(eggTypeLabel(8)).toBe('Unknown (#8)')
    expect(eggTypeLabel(99)).toBe('Unknown (#99)')
    expect(eggTypeLabel(-99)).toBe('Unknown (#-99)')
  })
})

describe('eggPokemonError', () => {
  const egg = (pokemon: number, type: number = EGG_TYPE.Pokemon): Egg => ({
    ...DEFAULT_NEW_EGG,
    pokemon,
    type,
  })

  test('accepts base species ids across the national dex', () => {
    expect(eggPokemonError(egg(25))).toBeNull()
    expect(eggPokemonError(egg(1))).toBeNull()
    expect(eggPokemonError(egg(NATIONAL_NAMES.length))).toBeNull()
    expect(eggPokemonError(egg(133, EGG_TYPE.EggItem))).toBeNull()
  })

  test('accepts a form id present in POKEMON_FORMS', () => {
    expect(POKEMON_FORMS['306.01']).toBeDefined()
    expect(eggPokemonError(egg(306.01))).toBeNull()
  })

  test('rejects ids the game does not know', () => {
    expect(eggPokemonError(egg(99999))).toMatch(/99999/)
    expect(eggPokemonError(egg(NATIONAL_NAMES.length + 1))).not.toBeNull()
    expect(eggPokemonError(egg(25.99))).toMatch(/25\.99/)
    expect(eggPokemonError(egg(-1))).not.toBeNull()
    expect(eggPokemonError(egg(Number.NaN))).not.toBeNull()
  })

  test('0 is valid only for an empty egg', () => {
    expect(eggPokemonError(egg(0, EGG_TYPE.None))).toBeNull()
    expect(eggPokemonError(egg(0, EGG_TYPE.Pokemon))).not.toBeNull()
    expect(eggPokemonError(egg(0, EGG_TYPE.EggItem))).not.toBeNull()
  })

  test('constants keep the game defaults', () => {
    expect(SHINY_CHANCE_BREEDING).toBe(1024)
    expect(MAX_EGG_SLOTS).toBe(4)
    expect(EMPTY_EGG.shinyChance).toBe(SHINY_CHANCE_BREEDING)
    expect(DEFAULT_NEW_EGG.shinyChance).toBe(SHINY_CHANCE_BREEDING)
  })
})
