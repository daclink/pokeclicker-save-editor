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
  EMPTY_EGG,
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

describe('removeEgg / addEgg', () => {
  test('removeEgg shrinks the list', () => {
    const data = loadFixture()
    const before = readEggs(data).length
    removeEgg(data, 0)
    expect(readEggs(data).length).toBe(before - 1)
  })

  test('removeEgg rejects out-of-range index', () => {
    const data = loadFixture()
    expect(() => removeEgg(data, 999)).toThrow(/out of range/)
  })

  test('addEgg appends DEFAULT_NEW_EGG and returns its index', () => {
    const data = loadFixture()
    const before = readEggs(data).length
    const idx = addEgg(data)
    expect(idx).toBe(before)
    expect(readEggs(data)[idx]).toEqual(DEFAULT_NEW_EGG)
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

describe('quickAddEgg', () => {
  test('fills the first empty slot when one exists', () => {
    const data = loadFixture()
    // Force-clear slot 0 so we have a known empty target.
    clearEgg(data, 0)
    const idx = quickAddEgg(data, QUICK_ADD_PRESETS[0]) // Grass / Bulbasaur
    expect(idx).toBe(0)
    const eggs = readEggs(data)
    expect(eggs[0].type).toBe(3)
    expect(eggs[0].pokemon).toBe(1)
    expect(eggs[0].steps).toBe(0)
    expect(eggs[0].totalSteps).toBe(9000)
  })

  test('appends when no empty slot exists and bumps eggSlots', () => {
    const data = loadFixture()
    // Ensure every slot is full by writing non-empty eggs everywhere.
    const eggs = readEggs(data)
    for (let i = 0; i < eggs.length; i++) {
      setEgg(data, i, { ...DEFAULT_NEW_EGG, pokemon: i + 1, type: 0 })
    }
    const beforeLen = eggs.length
    const beforeSlots = readEggSlots(data)

    const idx = quickAddEgg(data, QUICK_ADD_PRESETS[3]) // Dragon
    expect(idx).toBe(beforeLen)
    expect(readEggs(data).length).toBe(beforeLen + 1)
    expect(readEggSlots(data)).toBeGreaterThanOrEqual(beforeLen + 1)
    expect(readEggSlots(data)).toBeGreaterThan(beforeSlots - 1)
  })
})

describe('eggTypeLabel', () => {
  test('known labels', () => {
    expect(eggTypeLabel(-1)).toBe('Empty')
    expect(eggTypeLabel(0)).toBe('Pokémon')
    expect(eggTypeLabel(3)).toBe('Grass')
    expect(eggTypeLabel(8)).toBe('Fossil')
  })

  test('unknown type → "?"', () => {
    expect(eggTypeLabel(99)).toBe('?')
    expect(eggTypeLabel(-99)).toBe('?')
  })
})
