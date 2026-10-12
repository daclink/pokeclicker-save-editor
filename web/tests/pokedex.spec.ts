/**
 * Pure-function tests for the Pokédex mark-caught helpers — web port of
 * pcedit_gui.PokedexTab. Marking appends minimal entries to
 * save.party.caughtPokemon; the optional stat bump mirrors _bump_stats.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes } from '../src/lib/save'
import {
  ALL_REGIONS,
  DATA_GAME_VERSION,
  NATIONAL_NAMES,
  POKEMON_FORMS,
  REGION_RANGES,
  nameFor,
  statBucketFor,
} from '../src/lib/data'
import {
  caughtIdSet,
  exactIdFirst,
  filterRows,
  formsMarkableFor,
  formsOf,
  markCaught,
  regionRows,
  sortRows,
  type DexRow,
} from '../src/lib/pokedex'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'tests',
  'fixtures',
  'v0.10.25',
  'minimal.txt',
)
const load = () => decodeBytes(readFileSync(FIXTURE, 'utf8').trim())

/** Set (or with `null`, remove) `save.update.version` on a loaded save. */
function withVersion<T extends ReturnType<typeof load>>(data: T, version: string | null): T {
  const save = data.save as Record<string, any>
  if (version === null) delete save.update
  else save.update = { ...(save.update ?? {}), version }
  return data
}
/** The fixture is a v0.10.25 export; form marking needs a save at least as
 *  new as the editor's data, so form tests load it as the data's version. */
const loadCurrent = () => withVersion(load(), DATA_GAME_VERSION)

// Fixture has exactly Charmander (#4) and Pikachu (#25) caught, both in Kanto.
const KANTO = REGION_RANGES[0]

function rawParty(data: ReturnType<typeof load>): Array<Record<string, unknown>> {
  return (data.save as any).party.caughtPokemon
}
function stats(data: ReturnType<typeof load>): Record<string, any> {
  return (data.save as any).statistics
}

describe('caughtIdSet', () => {
  test('collects the ids already in the party', () => {
    const set = caughtIdSet(load())
    expect(set.has(4)).toBe(true)
    expect(set.has(25)).toBe(true)
    expect(set.size).toBe(2)
  })
})

describe('regionRows', () => {
  test('Kanto starts at #1 and lists the whole region', () => {
    expect(KANTO.lo).toBe(1)
    const rows = regionRows(load(), KANTO)
    expect(rows.length).toBe(KANTO.hi - KANTO.lo + 1)
    expect(rows[0]).toEqual({ pid: 1, name: 'Bulbasaur', caught: false })
    expect(rows.find((r) => r.pid === 4)?.caught).toBe(true)
    expect(rows.find((r) => r.pid === 25)?.caught).toBe(true)
  })

  test('uncaughtOnly drops already-caught rows', () => {
    const rows = regionRows(load(), KANTO, true)
    expect(rows.some((r) => r.pid === 4)).toBe(false)
    expect(rows.some((r) => r.pid === 25)).toBe(false)
    expect(rows.length).toBe(KANTO.hi - KANTO.lo + 1 - 2)
  })
})

describe('regionRows with ALL_REGIONS', () => {
  test('lists every national-dex id once, in order', () => {
    const rows = regionRows(load(), ALL_REGIONS)
    expect(rows).toHaveLength(NATIONAL_NAMES.length)
    expect(rows[0].pid).toBe(1)
    expect(rows[rows.length - 1].pid).toBe(NATIONAL_NAMES.length)
  })

  test('uncaughtOnly drops the two fixture catches across all regions', () => {
    const rows = regionRows(load(), ALL_REGIONS, true)
    expect(rows).toHaveLength(NATIONAL_NAMES.length - 2)
    expect(rows.map((r) => r.pid)).not.toContain(4)
    expect(rows.map((r) => r.pid)).not.toContain(25)
  })
})

describe('markCaught', () => {
  test('appends minimal entries for uncaught ids and skips caught ones', () => {
    const data = load()
    const added = markCaught(data, [1, 2, 4]) // 4 already caught
    expect(added).toBe(2)
    const set = caughtIdSet(data)
    expect(set.has(1)).toBe(true)
    expect(set.has(2)).toBe(true)
    const entry1 = rawParty(data).find((e) => e.id === 1)
    expect(entry1).toEqual({ '2': { '0': 0, '1': 0, '2': 0 }, '3': 1, id: 1 })
  })

  test('without bumpStats, statistics is left untouched', () => {
    const data = load()
    const before = JSON.stringify(stats(data))
    markCaught(data, [1, 2, 3])
    expect(JSON.stringify(stats(data))).toBe(before)
  })

  test('with bumpStats, capture counters and totals are updated', () => {
    const data = load()
    const s0 = stats(data)
    const total0 = Number(s0.totalPokemonCaptured ?? 0)
    const male0 = Number(s0.totalMalePokemonCaptured ?? 0)
    // pids 1,2,3 are uncaught and (per gender-buckets.json) male-bucket.
    markCaught(data, [1, 2, 3], { bumpStats: true })
    const s1 = stats(data)
    expect(Number(s1.totalPokemonCaptured)).toBe(total0 + 3)
    expect(Number(s1.totalPokemonEncountered ?? 0)).toBeGreaterThanOrEqual(3)
    expect(s1.pokemonCaptured['1']).toBeGreaterThanOrEqual(1)
    expect(s1.pokemonEncountered['1']).toBeGreaterThanOrEqual(1)
    // each of 1,2,3 maps to the male bucket in the fixture's roster
    const maleAdded = [1, 2, 3].filter((p) => statBucketFor(p) === 'totalMalePokemonCaptured').length
    expect(Number(s1.totalMalePokemonCaptured)).toBe(male0 + maleAdded)
  })

  test('bumpStats only counts newly-added ids, not re-marks', () => {
    const data = load()
    const total0 = Number(stats(data).totalPokemonCaptured ?? 0)
    markCaught(data, [4, 25], { bumpStats: true }) // both already caught
    expect(Number(stats(data).totalPokemonCaptured ?? 0)).toBe(total0)
  })
})

// Pikachu (#25) has many forms (25.01 …); the fixture has base #25 caught only.
const PIKACHU = 25
const PIKACHU_FORM = 25.01
const UNKNOWN_FORM = 25.99
const pikachuFormCount = Object.keys(POKEMON_FORMS).filter((k) => Math.trunc(Number(k)) === PIKACHU).length

describe('formsOf', () => {
  test('returns every form of a base id, numerically sorted', () => {
    const forms = formsOf(PIKACHU)
    expect(forms).toHaveLength(pikachuFormCount)
    expect(forms[0]).toBe(PIKACHU_FORM)
    expect([...forms].sort((a, b) => a - b)).toEqual(forms)
    expect(forms.every((f) => Math.trunc(f) === PIKACHU)).toBe(true)
  })

  test('sorts numerically, not lexically (869.1 right after 869.08, 869.7 after 869.68)', () => {
    const forms = formsOf(869)
    expect(forms.indexOf(869.1)).toBe(forms.indexOf(869.08) + 1)
    expect(forms.indexOf(869.7)).toBeGreaterThan(forms.indexOf(869.68))
  })

  test('a species with no forms gets an empty list', () => {
    expect(formsOf(11)).toEqual([]) // Metapod
  })
})

describe('regionRows with includeForms', () => {
  test('default (no forms) is unchanged', () => {
    expect(regionRows(load(), KANTO)).toHaveLength(KANTO.hi - KANTO.lo + 1)
  })

  test('forms follow their base species, named and uncaught', () => {
    const rows = regionRows(load(), KANTO, false, { includeForms: true })
    const base = rows.findIndex((r) => r.pid === PIKACHU)
    expect(rows[base + 1]).toEqual({ pid: PIKACHU_FORM, name: nameFor(PIKACHU_FORM), caught: false })
    expect(rows.slice(base + 1, base + 1 + pikachuFormCount).map((r) => r.pid)).toEqual(formsOf(PIKACHU))
    expect(rows.some((r) => r.pid === UNKNOWN_FORM)).toBe(false)
  })

  test('a caught form is marked caught and dropped by uncaughtOnly', () => {
    const data = loadCurrent()
    markCaught(data, [PIKACHU_FORM])
    const all = regionRows(data, KANTO, false, { includeForms: true })
    expect(all.find((r) => r.pid === PIKACHU_FORM)?.caught).toBe(true)
    const uncaught = regionRows(data, KANTO, true, { includeForms: true })
    expect(uncaught.some((r) => r.pid === PIKACHU_FORM)).toBe(false)
    expect(uncaught.some((r) => r.pid === 25.02)).toBe(true)
  })

  test('reading rows never mutates the save', () => {
    const data = load()
    const before = JSON.stringify(data)
    regionRows(data, ALL_REGIONS, false, { includeForms: true })
    expect(JSON.stringify(data)).toBe(before)
  })
})

describe('markCaught with form ids', () => {
  test('stores the form id as a number and skips re-marks', () => {
    const data = loadCurrent()
    expect(markCaught(data, [PIKACHU_FORM])).toBe(1)
    const entry = rawParty(data).find((e) => e.id === PIKACHU_FORM)
    expect(typeof entry?.id).toBe('number')
    expect(markCaught(data, [PIKACHU_FORM])).toBe(0)
    expect(rawParty(data).filter((e) => e.id === PIKACHU_FORM)).toHaveLength(1)
  })

  test('bumpStats uses the form key and the base species gender bucket', () => {
    const data = loadCurrent()
    const bucket = statBucketFor(PIKACHU)!
    const bucket0 = Number(stats(data)[bucket] ?? 0)
    markCaught(data, [PIKACHU_FORM], { bumpStats: true })
    expect(stats(data).pokemonCaptured[String(PIKACHU_FORM)]).toBeGreaterThanOrEqual(1)
    expect(Number(stats(data)[bucket])).toBe(bucket0 + 1)
  })
})

// Forms come from the editor's data (data/manifest.json gameVersion); a save
// from an older game build may lack them, and the game can't load a party id
// missing from its PokemonList.ts.
describe('form marking is gated on the save game version', () => {
  const OLDER = '0.10.25'
  const NEWER = '0.10.27'

  test('the test versions bracket the data version', () => {
    expect(DATA_GAME_VERSION).toBe('0.10.26')
  })

  test('formsMarkableFor: older refuses, equal and newer allow', () => {
    expect(formsMarkableFor(withVersion(load(), OLDER))).toBe(false)
    expect(formsMarkableFor(withVersion(load(), DATA_GAME_VERSION))).toBe(true)
    expect(formsMarkableFor(withVersion(load(), NEWER))).toBe(true)
  })

  test('formsMarkableFor compares numerically (0.9.x is older than 0.10.x)', () => {
    expect(formsMarkableFor(withVersion(load(), '0.9.99'), '0.10.0')).toBe(false)
    expect(formsMarkableFor(withVersion(load(), '0.10.3'), '0.10.26')).toBe(false)
  })

  test('missing or unparseable save version is allowed (old exports may lack it)', () => {
    expect(formsMarkableFor(withVersion(load(), null))).toBe(true)
    expect(formsMarkableFor(withVersion(load(), 'not-a-version'))).toBe(true)
  })

  test('markCaught skips form ids on an older save but still adds base species', () => {
    const data = withVersion(load(), OLDER)
    expect(markCaught(data, [1, PIKACHU_FORM])).toBe(1)
    const ids = caughtIdSet(data)
    expect(ids.has(1)).toBe(true)
    expect(ids.has(PIKACHU_FORM)).toBe(false)
  })

  test('markCaught on an older save with only forms writes nothing', () => {
    const data = withVersion(load(), OLDER)
    const before = JSON.stringify(data)
    expect(markCaught(data, [PIKACHU_FORM], { bumpStats: true })).toBe(0)
    expect(JSON.stringify(data)).toBe(before)
  })

  test('markCaught adds forms on an equal or newer save, and with no version', () => {
    for (const v of [DATA_GAME_VERSION, NEWER, null]) {
      const data = withVersion(load(), v)
      expect(markCaught(data, [PIKACHU_FORM]), String(v)).toBe(1)
      expect(caughtIdSet(data).has(PIKACHU_FORM)).toBe(true)
    }
  })

  test('formsMarkableFor never mutates the save', () => {
    const data = withVersion(load(), OLDER)
    const before = JSON.stringify(data)
    formsMarkableFor(data)
    expect(JSON.stringify(data)).toBe(before)
  })
})

// --- filter + sort ------------------------------------------------------------

const ROWS: DexRow[] = [
  { pid: 25, name: 'Pikachu', caught: true },
  { pid: 25.01, name: 'Flying Pikachu', caught: false },
  { pid: 201, name: 'Unown', caught: false },
  { pid: 201.06, name: 'Unown (G)', caught: false },
  { pid: 26, name: 'Raichu', caught: false },
  { pid: 250, name: 'Ho-Oh', caught: false },
]
const pids = (rows: readonly DexRow[]) => rows.map((r) => r.pid)

describe('filterRows', () => {
  test('an empty or blank query keeps every row', () => {
    expect(filterRows(ROWS, '')).toEqual(ROWS)
    expect(filterRows(ROWS, '   ')).toEqual(ROWS)
  })

  test('text matches anywhere in the name, ignoring case', () => {
    expect(pids(filterRows(ROWS, 'pika'))).toEqual([25, 25.01])
    expect(pids(filterRows(ROWS, 'UNOWN'))).toEqual([201, 201.06])
  })

  test('a number matches ids by prefix, so a species brings its forms', () => {
    expect(pids(filterRows(ROWS, '201'))).toEqual([201, 201.06])
    expect(pids(filterRows(ROWS, '25'))).toEqual([25, 25.01, 250])
  })

  test('a leading # is allowed on an id query', () => {
    expect(pids(filterRows(ROWS, '#201.06'))).toEqual([201.06])
  })

  test('a query matching nothing returns no rows', () => {
    expect(filterRows(ROWS, 'zzz')).toEqual([])
  })

  test('never mutates the input', () => {
    const copy = structuredClone(ROWS)
    filterRows(ROWS, 'pika')
    expect(ROWS).toEqual(copy)
  })
})

describe('sortRows', () => {
  test('id ascending is numeric (forms right after their species)', () => {
    expect(pids(sortRows(ROWS, 'id', 'asc'))).toEqual([25, 25.01, 26, 201, 201.06, 250])
  })

  test('id descending reverses it', () => {
    expect(pids(sortRows(ROWS, 'id', 'desc'))).toEqual([250, 201.06, 201, 26, 25.01, 25])
  })

  test('name sorts alphabetically, ignoring case', () => {
    expect(sortRows(ROWS, 'name', 'asc').map((r) => r.name)).toEqual([
      'Flying Pikachu', 'Ho-Oh', 'Pikachu', 'Raichu', 'Unown', 'Unown (G)',
    ])
  })

  test('name descending reverses it', () => {
    expect(sortRows(ROWS, 'name', 'desc')[0].name).toBe('Unown (G)')
  })

  test('returns a new array and leaves the input order alone', () => {
    const before = pids(ROWS)
    const sorted = sortRows(ROWS, 'name', 'asc')
    expect(sorted).not.toBe(ROWS)
    expect(pids(ROWS)).toEqual(before)
  })
})

describe('exactIdFirst', () => {
  const desc = sortRows(ROWS, 'id', 'desc')
  const byName = sortRows(ROWS, 'name', 'asc')

  test('a numeric query lifts the exact species and its forms to the top', () => {
    // filtered "25" → 25, 25.01, 250; sorted desc → 250, 25.01, 25
    const shown = sortRows(filterRows(ROWS, '25'), 'id', 'desc')
    expect(pids(exactIdFirst(shown, '25'))).toEqual([25.01, 25, 250])
  })

  test('the exact group keeps the chosen sort order, as does the rest', () => {
    // Name order is Flying Pikachu, Ho-Oh, Pikachu, Raichu, Unown, Unown (G).
    expect(pids(exactIdFirst(byName, '25'))).toEqual([25.01, 25, 250, 26, 201, 201.06])
  })

  test('a leading # and a form id use the species as the exact group', () => {
    expect(pids(exactIdFirst(desc, '#25'))).toEqual([25.01, 25, 250, 201.06, 201, 26])
    expect(pids(exactIdFirst(desc, '25.01'))).toEqual([25.01, 25, 250, 201.06, 201, 26])
  })

  test('no exact match leaves the order alone', () => {
    expect(pids(exactIdFirst(desc, '2'))).toEqual(pids(desc))
  })

  test('text and blank queries leave the order alone', () => {
    expect(pids(exactIdFirst(desc, 'pika'))).toEqual(pids(desc))
    expect(pids(exactIdFirst(desc, ''))).toEqual(pids(desc))
    expect(pids(exactIdFirst(desc, '   '))).toEqual(pids(desc))
  })

  test('returns a new array and leaves the input alone', () => {
    const before = pids(desc)
    const out = exactIdFirst(desc, '25')
    expect(out).not.toBe(desc)
    expect(pids(desc)).toEqual(before)
  })
})
