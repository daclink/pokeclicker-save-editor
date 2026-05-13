/**
 * Round-trip tests for the TypeScript port of `pokeclicker_save.py`.
 *
 * The Python suite asserts byte-exact round-trip against
 * `tests/fixtures/v0.10.25/minimal.txt`; this file asserts the same against
 * the same fixture, plus a semantic round-trip that we'll lean on once
 * real-save tests (with `27.0` floats) come online.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  decodeBytes,
  encodeBytes,
  getPath,
  setPath,
} from '../src/lib/save'

// Shared fixture — same file the Python suite reads. Walks up two
// directories from web/tests/ to the repo root.
const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'tests',
  'fixtures',
  'v0.10.25',
  'minimal.txt',
)

const fixtureBytes = (): string => readFileSync(FIXTURE, 'utf8').trim()

describe('save format', () => {
  test('decode produces the expected top-level shape', () => {
    const data = decodeBytes(fixtureBytes())
    expect(data).toHaveProperty('player')
    expect(data).toHaveProperty('save')
    expect(data).toHaveProperty('settings')
  })

  test('byte-exact round-trip against the fixture', () => {
    // Holds because the fixture is hand-built with no `.0` floats. Real
    // saves carry int↔float drift on a handful of fields, so we treat the
    // semantic test below as the contract for arbitrary inputs.
    const original = fixtureBytes()
    expect(encodeBytes(decodeBytes(original))).toBe(original)
  })

  test('semantic round-trip: decode→encode→decode deep-equals', () => {
    const data1 = decodeBytes(fixtureBytes())
    const data2 = decodeBytes(encodeBytes(data1))
    expect(data2).toEqual(data1)
  })

  test('latin-1 quirk: "Pokémon Tower" survives the round-trip', () => {
    const data = decodeBytes(fixtureBytes())
    expect(getPath(data, 'player._townName')).toBe('Pokémon Tower')
  })

  test('getPath walks dot + index + [k=v] selectors', () => {
    const data = decodeBytes(fixtureBytes())
    expect(getPath(data, 'player._region')).toBe(0)
    expect(getPath(data, 'save.wallet.currencies[0]')).toBe(10000)
    expect(getPath(data, 'save.breeding.eggSlots')).toBe(2)
    const entry = getPath(data, 'save.party.caughtPokemon[id=4]') as
      | Record<string, unknown>
      | undefined
    expect(entry).toBeDefined()
    expect(entry!.id).toBe(4)
  })

  test('setPath mutates in place', () => {
    const data = decodeBytes(fixtureBytes())
    setPath(data, 'save.wallet.currencies[0]', 99999)
    expect(getPath(data, 'save.wallet.currencies[0]')).toBe(99999)
  })
})
