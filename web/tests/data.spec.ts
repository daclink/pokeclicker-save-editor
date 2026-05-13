/**
 * Sanity-check the reference data loaded from `data/*.json`.
 *
 * Mirrors `tests/test_schema.py` (`PokemonDataTest`, `BerryDataTest`):
 * roster sizes, special-character names, region coverage, bucket validity,
 * berry endpoints, mulch fallback. One source of truth, two runtimes.
 */
import { describe, expect, test } from 'vitest'

import {
  BERRY_NAMES,
  KANTO_NAMES,
  MULCH_NAMES,
  NATIONAL_NAMES,
  REGION_RANGES,
  nameFor,
  nameForBerry,
  nameForMulch,
  regionFor,
  statBucketFor,
} from '../src/lib/data'

describe('national-dex names', () => {
  test('roster has 1025 entries', () => {
    expect(NATIONAL_NAMES.length).toBe(1025)
  })

  test('every name is non-empty', () => {
    NATIONAL_NAMES.forEach((n, i) => {
      expect(n, `empty name at index ${i}`).toBeTruthy()
    })
  })

  test('special-character display names round-trip from PokeAPI overrides', () => {
    // Same spot-checks the Python suite makes.
    const cases: Array<[number, string]> = [
      [1, 'Bulbasaur'],
      [29, 'Nidoran♀'],
      [32, 'Nidoran♂'],
      [83, "Farfetch'd"],
      [122, 'Mr. Mime'],
      [132, 'Ditto'],
      [151, 'Mew'],
      [250, 'Ho-Oh'],
      [439, 'Mime Jr.'],
      [474, 'Porygon-Z'],
      [772, 'Type: Null'],
      [785, 'Tapu Koko'],
      [865, "Sirfetch'd"],
      [1025, 'Pecharunt'],
    ]
    for (const [pid, expected] of cases) {
      expect(nameFor(pid), `name mismatch for #${pid}`).toBe(expected)
    }
  })

  test('nameFor tolerates float/string ids and unknown values', () => {
    expect(nameFor(1.0)).toBe('Bulbasaur')
    expect(nameFor('1')).toBe('Bulbasaur')
    expect(nameFor(null)).toBe('?')
    expect(nameFor(undefined)).toBe('?')
    expect(nameFor(99999)).toBe('?')
    expect(nameFor(0)).toBe('?')
  })

  test('KANTO_NAMES is the first 151 entries', () => {
    expect(KANTO_NAMES.length).toBe(151)
    expect(KANTO_NAMES[0]).toBe('Bulbasaur')
    expect(KANTO_NAMES[150]).toBe('Mew')
  })
})

describe('regions', () => {
  test('every range boundary resolves', () => {
    const ids = [
      1, 151, 152, 251, 252, 386, 387, 493, 494, 649,
      650, 721, 722, 809, 810, 905, 906, 1025,
    ]
    for (const pid of ids) {
      expect(regionFor(pid), `region missing for #${pid}`).not.toBe('?')
    }
  })

  test('REGION_RANGES is dense over [1, 1025]', () => {
    expect(REGION_RANGES[0]).toEqual({ label: 'Kanto', lo: 1, hi: 151 })
    expect(REGION_RANGES[REGION_RANGES.length - 1]).toEqual({
      label: 'Paldea',
      lo: 906,
      hi: 1025,
    })
  })

  test('out-of-range ids return "?"', () => {
    expect(regionFor(0)).toBe('?')
    expect(regionFor(99999)).toBe('?')
    expect(regionFor(null)).toBe('?')
  })
})

describe('gender buckets', () => {
  const VALID = new Set([
    'totalMalePokemonCaptured',
    'totalFemalePokemonCaptured',
    'totalGenderlessPokemonCaptured',
  ])

  test('every id returns a valid label', () => {
    for (let pid = 1; pid <= NATIONAL_NAMES.length; pid++) {
      const bucket = statBucketFor(pid)
      expect(VALID.has(bucket as string), `invalid bucket for #${pid}: ${bucket}`).toBe(true)
    }
  })

  test('genderless species spot-checks', () => {
    // Legendaries / fossils / Magnemite line.
    const ids = [132, 137, 144, 145, 146, 150, 151, 250, 251, 374, 375, 376,
                 377, 378, 379, 382, 383, 384, 385, 386, 1025]
    for (const pid of ids) {
      expect(statBucketFor(pid), `#${pid} should be genderless`).toBe(
        'totalGenderlessPokemonCaptured',
      )
    }
  })

  test('female-only species spot-checks', () => {
    const ids = [29, 30, 31, 113, 115, 124, 238, 241, 242, 380]
    for (const pid of ids) {
      expect(statBucketFor(pid), `#${pid} should be female bucket`).toBe(
        'totalFemalePokemonCaptured',
      )
    }
  })

  test('male-only species spot-checks', () => {
    const ids = [32, 33, 34, 106, 107, 128, 236, 237, 313, 381]
    for (const pid of ids) {
      expect(statBucketFor(pid), `#${pid} should be male bucket`).toBe(
        'totalMalePokemonCaptured',
      )
    }
  })

  test('out-of-range returns null', () => {
    expect(statBucketFor(0)).toBeNull()
    expect(statBucketFor(NATIONAL_NAMES.length + 1)).toBeNull()
    expect(statBucketFor(99999)).toBeNull()
  })
})

describe('berries', () => {
  test('roster has 70 entries with the expected endpoints', () => {
    expect(BERRY_NAMES.length).toBe(70)
    expect(BERRY_NAMES[0]).toBe('Cheri')
    expect(BERRY_NAMES[BERRY_NAMES.length - 1]).toBe('Hopo')
  })

  test('every berry name is non-empty', () => {
    BERRY_NAMES.forEach((n, i) => {
      expect(n, `empty berry name at index ${i}`).toBeTruthy()
    })
  })

  test('nameForBerry handles edges', () => {
    expect(nameForBerry(0)).toBe(BERRY_NAMES[0])
    expect(nameForBerry(BERRY_NAMES.length - 1)).toBe(BERRY_NAMES[BERRY_NAMES.length - 1])
    expect(nameForBerry(-1)).toBe('?')
    expect(nameForBerry(BERRY_NAMES.length)).toBe('?')
    expect(nameForBerry('0')).toBe(BERRY_NAMES[0])
    expect(nameForBerry(null)).toBe('?')
  })
})

describe('mulch', () => {
  test('at least 6 names, Boost first', () => {
    expect(MULCH_NAMES.length).toBeGreaterThanOrEqual(6)
    expect(MULCH_NAMES[0]).toBe('Boost')
  })

  test('nameForMulch falls back to "Slot N" for indices beyond the enum', () => {
    expect(nameForMulch(0)).toBe(MULCH_NAMES[0])
    expect(nameForMulch(MULCH_NAMES.length)).toBe(`Slot ${MULCH_NAMES.length}`)
    expect(nameForMulch(-1)).toBe('?')
    expect(nameForMulch(null)).toBe('?')
  })
})
