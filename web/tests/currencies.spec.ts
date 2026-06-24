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
  multiplierLabel,
  readCurrencies,
  readMultipliers,
  setMultiplier,
  writeCurrencies,
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
  test('always shows the three vitamins, defaulting to 1.0', () => {
    const data = loadFixture()
    const byKey = new Map(readMultipliers(data).map((r) => [r.key, r.value]))
    expect(byKey.get('Protein|money')).toBe(3.5) // present in fixture
    expect(byKey.get('Calcium|money')).toBe(1.0) // absent → default
    expect(byKey.get('Carbos|money')).toBe(1.0)
  })

  test('surfaces every entry actually present in the save (dynamic)', () => {
    const data = loadFixture()
    // Fixture also has Masterball|farmPoint = 1.4 — must appear dynamically.
    const row = readMultipliers(data).find((r) => r.key === 'Masterball|farmPoint')
    expect(row?.value).toBe(1.4)
  })

  test('surfaces real per-currency Master Ball keys (the bug being fixed)', () => {
    const data = loadFixture()
    const bag = (data.player as any)._itemMultipliers as Record<string, number>
    bag['Masterball|questPoint'] = 27
    const row = readMultipliers(data).find((r) => r.key === 'Masterball|questPoint')
    expect(row?.value).toBe(27)
  })

  test('multiplierLabel formats Item|currency keys', () => {
    expect(multiplierLabel('Masterball|questPoint')).toBe(
      'Master Ball price multiplier (questPoint)',
    )
    expect(multiplierLabel('Protein|money')).toBe('Protein price multiplier (money)')
  })

  test('setMultiplier writes a value and drops at exactly 1.0', () => {
    const data = loadFixture()
    setMultiplier(data, 'Calcium|money', 2.5)
    const bag = (data.player as any)._itemMultipliers as Record<string, number>
    expect(bag['Calcium|money']).toBe(2.5)
    setMultiplier(data, 'Calcium|money', 1.0)
    expect('Calcium|money' in bag).toBe(false)
  })

  test('setMultiplier does not clobber unrelated entries', () => {
    const data = loadFixture()
    setMultiplier(data, 'Calcium|money', 2.0)
    const bag = (data.player as any)._itemMultipliers as Record<string, number>
    expect(bag['Protein|money']).toBe(3.5)
    expect(bag['Masterball|farmPoint']).toBe(1.4)
  })

  test('setMultiplier rejects negative inputs', () => {
    const data = loadFixture()
    expect(() => setMultiplier(data, 'Protein|money', -0.5)).toThrow(/non-negative/)
  })
})
