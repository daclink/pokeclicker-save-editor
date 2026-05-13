/**
 * Pure-function tests for the currencies/multipliers helpers.
 *
 * The tab itself is a thin Svelte component over these — if the helpers are
 * right, the component is mostly form plumbing.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes } from '../src/lib/save'
import {
  MULTIPLIERS,
  readCurrencies,
  readMultipliers,
  writeCurrencies,
  writeMultipliers,
} from '../src/lib/currencies'

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

describe('currencies', () => {
  test('readCurrencies pulls positional values from save.wallet.currencies', () => {
    const data = loadFixture()
    expect(readCurrencies(data)).toEqual({
      money: 10000,
      tokens: 1000,
      quest: 100,
      diamonds: 10,
      farm: 50,
    })
  })

  test('writeCurrencies round-trips through readCurrencies', () => {
    const data = loadFixture()
    writeCurrencies(data, {
      money: 9999999,
      tokens: 500000,
      quest: 250000,
      diamonds: 2500,
      farm: 75000,
    })
    expect(readCurrencies(data)).toEqual({
      money: 9999999,
      tokens: 500000,
      quest: 250000,
      diamonds: 2500,
      farm: 75000,
    })
  })

  test('writeCurrencies preserves higher slots (battle points, etc.)', () => {
    const data = loadFixture()
    const before = ((data.save as any).wallet.currencies as number[])[5]
    writeCurrencies(data, {
      money: 1,
      tokens: 2,
      quest: 3,
      diamonds: 4,
      farm: 5,
    })
    expect(((data.save as any).wallet.currencies as number[])[5]).toBe(before)
  })

  test('writeCurrencies rejects negative and non-integer inputs', () => {
    const data = loadFixture()
    expect(() =>
      writeCurrencies(data, {
        money: -1,
        tokens: 0,
        quest: 0,
        diamonds: 0,
        farm: 0,
      }),
    ).toThrow(/non-negative integer/)
    expect(() =>
      writeCurrencies(data, {
        money: 1.5,
        tokens: 0,
        quest: 0,
        diamonds: 0,
        farm: 0,
      }),
    ).toThrow(/non-negative integer/)
  })
})

describe('multipliers', () => {
  test('readMultipliers falls back to 1.0 for missing entries', () => {
    const data = loadFixture()
    const m = readMultipliers(data)
    // Fixture has Protein|money = 3.5 and Masterball|farmPoint = 1.4 set;
    // Calcium and Carbos are unset and should read as 1.0.
    expect(m['Protein|money']).toBe(3.5)
    expect(m['Calcium|money']).toBe(1.0)
    expect(m['Carbos|money']).toBe(1.0)
    expect(m['Masterball|farmPoint']).toBe(1.4)
  })

  test('writeMultipliers drops keys at exactly 1.0', () => {
    const data = loadFixture()
    writeMultipliers(data, {
      'Protein|money': 1.0,
      'Calcium|money': 1.0,
      'Carbos|money': 1.0,
      'Masterball|farmPoint': 1.0,
    })
    const bag = (data.player as any)._itemMultipliers as Record<string, number>
    for (const { key } of MULTIPLIERS) {
      expect(bag[key], `${key} should be absent after write of 1.0`).toBeUndefined()
    }
  })

  test('writeMultipliers preserves non-1.0 values', () => {
    const data = loadFixture()
    writeMultipliers(data, {
      'Protein|money': 2.0,
      'Calcium|money': 1.0, // dropped
      'Carbos|money': 3.5,
      'Masterball|farmPoint': 1.7,
    })
    const bag = (data.player as any)._itemMultipliers as Record<string, number>
    expect(bag['Protein|money']).toBe(2.0)
    expect(bag['Calcium|money']).toBeUndefined()
    expect(bag['Carbos|money']).toBe(3.5)
    expect(bag['Masterball|farmPoint']).toBe(1.7)
  })

  test('writeMultipliers does not clobber unrelated _itemMultipliers entries', () => {
    const data = loadFixture()
    const bag = (data.player as any)._itemMultipliers as Record<string, number>
    bag['Unknown|extra'] = 7.0 // simulate an unrelated entry the editor doesn't expose
    writeMultipliers(data, {
      'Protein|money': 1.0,
      'Calcium|money': 1.0,
      'Carbos|money': 1.0,
      'Masterball|farmPoint': 1.0,
    })
    expect(bag['Unknown|extra']).toBe(7.0)
  })

  test('writeMultipliers rejects negative inputs', () => {
    const data = loadFixture()
    expect(() =>
      writeMultipliers(data, {
        'Protein|money': -0.5,
        'Calcium|money': 1.0,
        'Carbos|money': 1.0,
        'Masterball|farmPoint': 1.0,
      }),
    ).toThrow(/non-negative/)
  })

  test('round-trip: read → write → read returns same values', () => {
    const data = loadFixture()
    const m = readMultipliers(data)
    writeMultipliers(data, m)
    expect(readMultipliers(data)).toEqual(m)
  })
})
