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
    // Fixture array is [10000, 1000, 100, 10, 50, 0, 0] — canonical order:
    // money / questPoint / dungeonToken / diamond / farmPoint / battlePoint
    // / contestToken.
    expect(readCurrencies(data)).toEqual({
      money:    10000,
      quest:    1000,
      tokens:   100,
      diamonds: 10,
      farm:     50,
      battle:   0,
      contest:  0,
    })
  })

  test('writeCurrencies round-trips through readCurrencies', () => {
    const data = loadFixture()
    writeCurrencies(data, {
      money:    9999999,
      quest:    250000,
      tokens:   500000,
      diamonds: 2500,
      farm:     75000,
      battle:   1234,
      contest:  567,
    })
    expect(readCurrencies(data)).toEqual({
      money:    9999999,
      quest:    250000,
      tokens:   500000,
      diamonds: 2500,
      farm:     75000,
      battle:   1234,
      contest:  567,
    })
  })

  test('writeCurrencies pads short wallets up to the contest-token slot', () => {
    const data = loadFixture()
    // Truncate the fixture wallet to simulate an older save without BP/contest.
    ;(data.save as any).wallet.currencies = [10000, 1000, 100, 10, 50]
    writeCurrencies(data, {
      money: 1, quest: 2, tokens: 3, diamonds: 4, farm: 5, battle: 6, contest: 7,
    })
    const arr = (data.save as any).wallet.currencies as number[]
    expect(arr).toHaveLength(7)
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  test('writeCurrencies rejects negative and non-integer inputs', () => {
    const data = loadFixture()
    const zeroed = {
      money: 0, quest: 0, tokens: 0, diamonds: 0, farm: 0, battle: 0, contest: 0,
    }
    expect(() => writeCurrencies(data, { ...zeroed, money: -1 })).toThrow(/non-negative integer/)
    expect(() => writeCurrencies(data, { ...zeroed, money: 1.5 })).toThrow(/non-negative integer/)
    expect(() => writeCurrencies(data, { ...zeroed, battle: -5 })).toThrow(/non-negative integer/)
    expect(() => writeCurrencies(data, { ...zeroed, contest: 1.1 })).toThrow(/non-negative integer/)
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
