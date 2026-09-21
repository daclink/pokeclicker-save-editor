/**
 * Sanity-check the reference data loaded from `data/*.json`.
 *
 * Mirrors `tests/test_schema.py` (`PokemonDataTest`, `BerryDataTest`):
 * roster sizes, special-character names, region coverage, bucket validity,
 * berry endpoints, mulch fallback. One source of truth, two runtimes.
 */
import { describe, expect, test } from 'vitest'

import {
  ALL_REGIONS,
  BERRY_NAMES,
  EGG_ITEMS,
  EVOLUTION_ITEMS,
  MEGA_STONES,
  itemDisplayName,
  DEX_REGION_OPTIONS,
  POKEMON_FORMS,
  formKey,
  KANTO_NAMES,
  MULCH_NAMES,
  NATIONAL_NAMES,
  REGION_RANGES,
  nameFor,
  nameForBerry,
  nameForMulch,
  regionFor,
  statBucketFor,
  typeNamesFor,
  typesFor,
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

  test('ALL_REGIONS spans the full national dex', () => {
    expect(ALL_REGIONS.lo).toBe(REGION_RANGES[0].lo)
    expect(ALL_REGIONS.hi).toBe(REGION_RANGES[REGION_RANGES.length - 1].hi)
    expect(ALL_REGIONS.hi - ALL_REGIONS.lo + 1).toBe(NATIONAL_NAMES.length)
  })

  test('ALL_REGIONS is a picker option, not a real region', () => {
    expect(REGION_RANGES).not.toContain(ALL_REGIONS)
    expect(DEX_REGION_OPTIONS[0]).toBe(ALL_REGIONS)
    expect(DEX_REGION_OPTIONS.slice(1)).toEqual(REGION_RANGES)
    // regionFor still names a species' real region, never "All regions".
    expect(regionFor(25)).toBe('Kanto')
  })

  test('picker labels are unique (the Pokédex <select> keys on them)', () => {
    const labels = DEX_REGION_OPTIONS.map((r) => r.label)
    expect(new Set(labels).size).toBe(labels.length)
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

describe('pokemon types', () => {
  test('typeNamesFor returns canonical PokeClicker types', () => {
    expect(typeNamesFor(1)).toEqual(['Grass', 'Poison']) // Bulbasaur
    expect(typeNamesFor(4)).toEqual(['Fire']) // Charmander
    expect(typeNamesFor(6)).toEqual(['Fire', 'Flying']) // Charizard
    expect(typeNamesFor(25)).toEqual(['Electric']) // Pikachu
    expect(typeNamesFor(131)).toEqual(['Water', 'Ice']) // Lapras
  })

  test('typesFor returns indices; out-of-range is empty', () => {
    expect(typesFor(1)).toEqual([4, 7])
    expect(typesFor(99999)).toEqual([])
    expect(typesFor(0)).toEqual([])
  })

  test('every species has 1 or 2 types', () => {
    for (let pid = 1; pid <= 1025; pid++) {
      const n = typesFor(pid).length
      expect(n === 1 || n === 2, `#${pid} has ${n} types`).toBe(true)
    }
  })
})

describe('pokémon forms (fractional ids)', () => {
  test('formKey stringifies like the save does, and only for forms', () => {
    expect(formKey(869.01)).toBe('869.01')
    expect(formKey('869.01')).toBe('869.01')
    expect(formKey(25.1)).toBe('25.1')
    expect(formKey('25.10')).toBe('25.1') // source literal with trailing zero
    expect(formKey(26)).toBeNull()
    expect(formKey('26')).toBeNull()
    expect(formKey(null)).toBeNull()
    expect(formKey('abc')).toBeNull()
    expect(formKey(Number.NaN)).toBeNull()
  })

  test('forms get their own names instead of the base species', () => {
    expect(nameFor(869.01)).toBe('Alcremie (Strawberry Ruby Cream)')
    expect(nameFor(26.01)).toBe('Alolan Raichu')
    expect(nameFor(25.1)).toBe('Flying Pikachu')
    expect(nameFor('6.04')).toBe('Charizard (Clone)')
  })

  test('base species are unchanged', () => {
    expect(nameFor(26)).toBe('Raichu')
    expect(nameFor(869)).toBe('Alcremie')
    expect(typeNamesFor(26)).toEqual(['Electric'])
  })

  test('forms get their own types', () => {
    expect(typeNamesFor(26.01)).toEqual(['Electric', 'Psychic'])
    expect(typeNamesFor(150.03)).toEqual(['Psychic', 'Steel'])
  })

  test('regional forms report their native region; others fall back to the dex', () => {
    expect(regionFor(26.01)).toBe('Alola') // Alolan Raichu, dex #26 is Kanto
    expect(regionFor(26)).toBe('Kanto')
    expect(regionFor(869.01)).toBe('Galar')
    expect(regionFor(58.01)).toBe('Kanto') // Hisuian Growlithe: Hisui isn't a picker region
  })

  test('unknown fractional id falls back to the base species', () => {
    expect(formKey(25.999)).toBe('25.999')
    expect(nameFor(25.999)).toBe('Pikachu')
    expect(typeNamesFor(25.999)).toEqual(['Electric'])
    expect(regionFor(25.999)).toBe('Kanto')
  })

  test('gender stat bucket stays per species', () => {
    expect(statBucketFor(26.01)).toBe(statBucketFor(26))
  })

  test('table shape: >= 600 forms, every key a non-integer, valid types + regions', () => {
    const keys = Object.keys(POKEMON_FORMS)
    expect(keys.length).toBeGreaterThanOrEqual(600)
    const regions = new Set(REGION_RANGES.map((r) => r.label))
    for (const k of keys) {
      const n = Number(k)
      expect(Number.isFinite(n) && !Number.isInteger(n), k).toBe(true)
      expect(String(n), `key ${k} is not normalized`).toBe(k)
      const f = POKEMON_FORMS[k]
      expect(f.name.length, k).toBeGreaterThan(0)
      for (const t of f.types) expect(t >= 0 && t < 18, `${k} type ${t}`).toBe(true)
      if (f.region !== undefined) expect(regions.has(f.region), `${k} ${f.region}`).toBe(true)
    }
  })
})

describe('inventory rosters', () => {
  test('egg items: the 7 EggItemType members, including Dragon_egg', () => {
    expect(EGG_ITEMS).toHaveLength(7)
    expect(EGG_ITEMS).toContain('Dragon_egg')
    expect(EGG_ITEMS).not.toContain('Lucky_egg') // a consumable, not an egg item
  })

  test('evolution items: StoneType without the None sentinel or underground loot', () => {
    expect(EVOLUTION_ITEMS.length).toBeGreaterThanOrEqual(50)
    expect(EVOLUTION_ITEMS[0]).toBe('Leaf_stone')
    expect(EVOLUTION_ITEMS).not.toContain('None')
    for (const loot of ['Oval_stone', 'Odd_keystone', 'Draco_plate', 'Hard_stone']) {
      expect(EVOLUTION_ITEMS).not.toContain(loot)
    }
    expect(new Set(EVOLUTION_ITEMS).size).toBe(EVOLUTION_ITEMS.length)
  })

  test('mega stones: 50, unique, every base is a national-dex species', () => {
    expect(MEGA_STONES.length).toBeGreaterThanOrEqual(50)
    expect(new Set(MEGA_STONES.map((m) => m.stone)).size).toBe(MEGA_STONES.length)
    for (const m of MEGA_STONES) expect(NATIONAL_NAMES, m.stone).toContain(m.base)
    expect(MEGA_STONES.find((m) => m.stone === 'Blue_Orb')?.base).toBe('Kyogre')
  })

  test('itemDisplayName turns save keys into labels', () => {
    expect(itemDisplayName('Kings_rock')).toBe('Kings rock')
    expect(itemDisplayName('Charizardite_X')).toBe('Charizardite X')
    expect(itemDisplayName('Upgrade')).toBe('Upgrade')
  })
})
