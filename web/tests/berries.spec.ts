/**
 * Pure-function tests for the berries/mulch/shovels helpers.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { BERRY_NAMES } from '../src/lib/data'
import { decodeBytes } from '../src/lib/save'
import {
  fillAllBerryCounts,
  readBerryRows,
  readMulch,
  readShovels,
  setAllBerriesUnlocked,
  setBerryCount,
  setBerryCounts,
  setBerryUnlocked,
  setBerryUnlockedMany,
  setMulchCount,
  setShovels,
} from '../src/lib/berries'

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

describe('readBerryRows', () => {
  test('returns 70 rows matching BERRY_NAMES order', () => {
    const rows = readBerryRows(loadFixture())
    expect(rows.length).toBe(BERRY_NAMES.length)
    expect(rows[0].name).toBe(BERRY_NAMES[0]) // Cheri
    expect(rows[69].name).toBe(BERRY_NAMES[69]) // Hopo
  })

  test('missing entries default to count=0, unlocked=false', () => {
    const data = loadFixture()
    // Fixture seeds only the first few unlocked entries; the tail should
    // come back as unlocked=false / count=0.
    const rows = readBerryRows(data)
    expect(rows[60].count).toBe(0)
    expect(rows[60].unlocked).toBe(false)
  })
})

describe('setBerryCount / setBerryUnlocked', () => {
  test('round-trip via readBerryRows', () => {
    const data = loadFixture()
    setBerryCount(data, 0, 1234)
    setBerryUnlocked(data, 0, true)
    const row = readBerryRows(data)[0]
    expect(row.count).toBe(1234)
    expect(row.unlocked).toBe(true)
  })

  test('writes True/False (real booleans), not 0/1', () => {
    const data = loadFixture()
    setBerryUnlocked(data, 5, true)
    setBerryUnlocked(data, 6, false)
    const unlocked = (data.save as any).farming.unlockedBerries as unknown[]
    expect(unlocked[5]).toBe(true)
    expect(unlocked[6]).toBe(false)
    expect(typeof unlocked[5]).toBe('boolean')
  })

  test('reject out-of-range indices', () => {
    const data = loadFixture()
    expect(() => setBerryCount(data, -1, 0)).toThrow(/out of range/)
    expect(() => setBerryCount(data, 70, 0)).toThrow(/out of range/)
    expect(() => setBerryUnlocked(data, 70, true)).toThrow(/out of range/)
  })

  test('reject negative or non-integer counts', () => {
    const data = loadFixture()
    expect(() => setBerryCount(data, 0, -1)).toThrow(/non-negative integer/)
    expect(() => setBerryCount(data, 0, 1.5)).toThrow(/non-negative integer/)
  })

  test('pads short lists up to 70 entries', () => {
    const data = loadFixture()
    // Force the lists to a short length and confirm a write extends them.
    ;(data.save as any).farming.berryList = [1, 2, 3]
    ;(data.save as any).farming.unlockedBerries = [true, false, true]
    setBerryCount(data, 50, 42)
    expect((data.save as any).farming.berryList.length).toBe(70)
    expect((data.save as any).farming.berryList[50]).toBe(42)
    // Earlier values are preserved.
    expect((data.save as any).farming.berryList[0]).toBe(1)
    expect((data.save as any).farming.unlockedBerries[0]).toBe(true)
  })
})

describe('selection-aware (setBerryCounts / setBerryUnlockedMany)', () => {
  test('applies the same count to all selected indices', () => {
    const data = loadFixture()
    setBerryCounts(data, [0, 5, 10, 25], 999)
    const rows = readBerryRows(data)
    expect(rows[0].count).toBe(999)
    expect(rows[5].count).toBe(999)
    expect(rows[10].count).toBe(999)
    expect(rows[25].count).toBe(999)
    // Untouched index keeps its original value.
    expect(rows[1].count).toBe((data.save as any).farming.berryList[1])
  })

  test('applies the same unlocked flag to all selected indices', () => {
    const data = loadFixture()
    setBerryUnlockedMany(data, [0, 1, 2], false)
    const rows = readBerryRows(data)
    expect(rows[0].unlocked).toBe(false)
    expect(rows[1].unlocked).toBe(false)
    expect(rows[2].unlocked).toBe(false)
  })
})

describe('bulk fill', () => {
  test('fillAllBerryCounts sets every entry', () => {
    const data = loadFixture()
    fillAllBerryCounts(data, 9999)
    for (const row of readBerryRows(data)) expect(row.count).toBe(9999)
  })

  test('setAllBerriesUnlocked sets every flag', () => {
    const data = loadFixture()
    setAllBerriesUnlocked(data, true)
    for (const row of readBerryRows(data)) expect(row.unlocked).toBe(true)
  })
})

describe('mulch + shovels', () => {
  test('readMulch returns at least 7 entries with absent slots as 0', () => {
    const data = loadFixture()
    const mulch = readMulch(data)
    expect(mulch.length).toBeGreaterThanOrEqual(7)
    for (const v of mulch) expect(typeof v).toBe('number')
  })

  test('setMulchCount writes and round-trips', () => {
    const data = loadFixture()
    setMulchCount(data, 0, 100)
    setMulchCount(data, 6, 25)
    const mulch = readMulch(data)
    expect(mulch[0]).toBe(100)
    expect(mulch[6]).toBe(25)
  })

  test('setMulchCount pads the mulch list for indices past the end', () => {
    const data = loadFixture()
    ;(data.save as any).farming.mulchList = [1, 2]
    setMulchCount(data, 5, 99)
    expect((data.save as any).farming.mulchList[5]).toBe(99)
    // Padded with zeros.
    expect((data.save as any).farming.mulchList[3]).toBe(0)
  })

  test('readShovels + setShovels round-trip', () => {
    const data = loadFixture()
    setShovels(data, 42, 7)
    expect(readShovels(data)).toEqual({ shovel: 42, mulchShovel: 7 })
  })

  test('setShovels rejects negative inputs', () => {
    const data = loadFixture()
    expect(() => setShovels(data, -1, 0)).toThrow(/non-negative/)
    expect(() => setShovels(data, 0, -1)).toThrow(/non-negative/)
  })
})
