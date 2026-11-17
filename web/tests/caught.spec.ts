/**
 * Pure-function tests for the caught-pokémon helpers.
 *
 * Key mapping is the canonical PokeClicker PartyPokemonSaveKeys:
 *   0 attackBonusPercent, 1 attackBonusAmount, 2 vitaminsUsed, 3 exp,
 *   4 breeding, 5 shiny, 8 pokerus, 9 effortPoints.
 *
 * Particular focus on (a) pokerus living at key "8" (NOT "1"), (b) shiny at
 * key "5", and (c) the key-present-iff-true rule for inEgg/shiny — a
 * regression there would break byte-identity round-trips against real saves
 * that have never had those flags set.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { decodeBytes } from '../src/lib/save'
import { SHINY_CHANCE_BREEDING } from '../src/lib/breeding'
import {
  readCaughtRows,
  setCaughtAtkBonus,
  setCaughtEntry,
  setCaughtEvs,
  POKERUS_RESISTANT_EVS,
  EFFORT_POINTS_PER_EV,
  SLOW_EVS_EP_MODIFIER,
  setCaughtInEgg,
  setCaughtPokerus,
  setCaughtShiny,
  isInEggOrQueue,
  POKERUS,
} from '../src/lib/caught'

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

/** Put a pokémon in a hatchery egg slot so the in-egg flag may be set. */
function withEgg(data: ReturnType<typeof loadFixture>, pokemon: number) {
  const save = data.save as any
  save.breeding = save.breeding ?? {}
  save.breeding.eggList = [
    { type: 0, pokemon, steps: 0, totalSteps: 100, shinyChance: SHINY_CHANCE_BREEDING, notified: false },
  ]
  return data
}

// Convenience: pull the raw save-side entry for a given id so we can check
// for actual key presence (not just truthiness).
function rawEntry(data: ReturnType<typeof loadFixture>, id: number): Record<string, unknown> {
  const list = (data.save as any).party.caughtPokemon as Array<Record<string, unknown>>
  const e = list.find((x) => x?.id === id)
  if (!e) throw new Error(`no entry with id ${id} in fixture`)
  return e
}

describe('readCaughtRows', () => {
  test('returns one row per caught pokémon with name lookups', () => {
    const rows = readCaughtRows(loadFixture())
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(typeof r.id).toBe('number')
      expect(typeof r.name).toBe('string')
      expect(r.name.length).toBeGreaterThan(0)
      expect(typeof r.atkBonus).toBe('number')
      expect(typeof r.pokerus).toBe('number')
      expect(typeof r.exp).toBe('number')
      expect(typeof r.inEgg).toBe('boolean')
      expect(typeof r.shiny).toBe('boolean')
    }
  })

  test('name lookup uses national-dex names', () => {
    const rows = readCaughtRows(loadFixture())
    // Fixture has Charmander (#4) and Pikachu (#25).
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get(4)?.name).toBe('Charmander')
    expect(byId.get(25)?.name).toBe('Pikachu')
  })

  test('pokerus reads key "8" (state), never "1" (attackBonusAmount)', () => {
    // Regression: the editor previously read pokerus from key "1", surfacing
    // large attackBonusAmount values as "pokerus". Pokerus lives at key "8".
    const data = loadFixture()
    const e = rawEntry(data, 4)
    e['1'] = 2046 // attackBonusAmount — a big number that must NOT be pokerus
    e['8'] = 2 // real pokerus = Contagious
    const row = readCaughtRows(data).find((r) => r.id === 4)!
    expect(row.pokerus).toBe(2)
  })

  test('shiny reads key "5"', () => {
    const data = loadFixture()
    rawEntry(data, 25)['5'] = true
    const row = readCaughtRows(data).find((r) => r.id === 25)!
    expect(row.shiny).toBe(true)
  })
})

describe('setCaughtEntry', () => {
  test('numeric fields round-trip to canonical keys', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { atkBonus: 100, pokerus: 3, exp: 1234567 })
    expect(rawEntry(data, 4)['0']).toBe(100) // attackBonusPercent
    expect(rawEntry(data, 4)['8']).toBe(3) // pokerus -> key "8", not "1"
    expect(rawEntry(data, 4)['3']).toBe(1234567)
    const row = readCaughtRows(data).find((r) => r.id === 4)!
    expect(row.atkBonus).toBe(100)
    expect(row.pokerus).toBe(3)
    expect(row.exp).toBe(1234567)
  })

  test('pokerus rejects values outside 0..3', () => {
    const data = loadFixture()
    expect(() => setCaughtEntry(data, 4, { pokerus: 4 })).toThrow(/pokerus/)
    expect(() => setCaughtEntry(data, 4, { pokerus: -1 })).toThrow(/pokerus/)
    expect(() => setCaughtEntry(data, 4, { pokerus: 1.5 })).toThrow(/pokerus/)
  })

  test('inEgg=true sets the "4" key; inEgg=false deletes it', () => {
    const data = withEgg(loadFixture(), 4)
    setCaughtEntry(data, 4, { inEgg: true })
    expect(rawEntry(data, 4)['4']).toBe(true)
    setCaughtEntry(data, 4, { inEgg: false })
    expect('4' in rawEntry(data, 4)).toBe(false)
  })

  test('shiny=true sets the "5" key; shiny=false deletes it', () => {
    const data = loadFixture()
    setCaughtEntry(data, 25, { shiny: true })
    expect(rawEntry(data, 25)['5']).toBe(true)
    setCaughtEntry(data, 25, { shiny: false })
    expect('5' in rawEntry(data, 25)).toBe(false)
  })

  test('preserves untouched fields and the vitamins sub-dict', () => {
    const data = loadFixture()
    const before = { ...rawEntry(data, 4) }
    setCaughtEntry(data, 4, { atkBonus: 50 })
    const after = rawEntry(data, 4)
    expect(after['1']).toBe(before['1']) // attackBonusAmount untouched
    expect(after['2']).toEqual(before['2']) // vitamins untouched
    expect(after['3']).toBe(before['3']) // exp untouched
  })

  test('throws on unknown id', () => {
    const data = loadFixture()
    expect(() => setCaughtEntry(data, 99999, { atkBonus: 0 })).toThrow(/no caught/)
  })

  test('rejects negative or non-integer numerics', () => {
    const data = loadFixture()
    expect(() => setCaughtEntry(data, 4, { atkBonus: -1 })).toThrow(/non-negative integer/)
    expect(() => setCaughtEntry(data, 4, { exp: 1.5 })).toThrow(/non-negative integer/)
  })
})

describe('quick-action bulk helpers', () => {
  test('setCaughtShiny true sets key "5", false deletes it', () => {
    const data = loadFixture()
    setCaughtShiny(data, [4, 25], true)
    expect(rawEntry(data, 4)['5']).toBe(true)
    expect(rawEntry(data, 25)['5']).toBe(true)
    setCaughtShiny(data, [4, 25], false)
    expect('5' in rawEntry(data, 4)).toBe(false)
    expect('5' in rawEntry(data, 25)).toBe(false)
  })

  test('setCaughtInEgg true sets the key, false deletes it', () => {
    const data = withEgg(loadFixture(), 4)
    setCaughtInEgg(data, [4], true)
    expect(rawEntry(data, 4)['4']).toBe(true)
    setCaughtInEgg(data, [4], false)
    expect('4' in rawEntry(data, 4)).toBe(false)
  })

  test('setCaughtAtkBonus writes to all listed ids', () => {
    const data = loadFixture()
    setCaughtAtkBonus(data, [4, 25], 100)
    const rows = readCaughtRows(data)
    expect(rows.find((r) => r.id === 4)?.atkBonus).toBe(100)
    expect(rows.find((r) => r.id === 25)?.atkBonus).toBe(100)
  })

  test('quick-action helpers tolerate ids missing from the save', () => {
    const data = loadFixture()
    // Mix valid and invalid; the valid id should still be written.
    setCaughtAtkBonus(data, [4, 99999], 25)
    expect(rawEntry(data, 4)['0']).toBe(25)
  })

  test('setCaughtAtkBonus rejects negative / non-integer', () => {
    const data = loadFixture()
    expect(() => setCaughtAtkBonus(data, [4], -1)).toThrow(/non-negative integer/)
    expect(() => setCaughtAtkBonus(data, [4], 1.5)).toThrow(/non-negative integer/)
  })
})

describe('setCaughtPokerus (bulk)', () => {
  test('writes the level to key "8" on every listed id', () => {
    const data = loadFixture()
    setCaughtPokerus(data, [4, 25], POKERUS.Contagious)
    expect(rawEntry(data, 4)['8']).toBe(2)
    expect(rawEntry(data, 25)['8']).toBe(2)
  })

  test('Uninfected deletes key "8" (the game drops default-valued keys)', () => {
    const data = loadFixture()
    setCaughtPokerus(data, [4], POKERUS.Resistant)
    setCaughtPokerus(data, [4], POKERUS.Uninfected)
    expect('8' in rawEntry(data, 4)).toBe(false)
  })

  test('Uninfected via setCaughtEntry also deletes key "8"', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { pokerus: POKERUS.Infected })
    expect(rawEntry(data, 4)['8']).toBe(1)
    setCaughtEntry(data, 4, { pokerus: POKERUS.Uninfected })
    expect('8' in rawEntry(data, 4)).toBe(false)
  })

  test.each([-1, 4, 1.5, Number.NaN])('rejects level %s without touching any entry', (bad) => {
    const data = loadFixture()
    const before = JSON.stringify((data.save as any).party.caughtPokemon)
    expect(() => setCaughtPokerus(data, [4, 25], bad)).toThrow(RangeError)
    expect(JSON.stringify((data.save as any).party.caughtPokemon)).toBe(before)
  })

  test('skips ids missing from the save, still updates the rest', () => {
    const data = loadFixture()
    setCaughtPokerus(data, [99999, 25], POKERUS.Infected)
    expect(rawEntry(data, 25)['8']).toBe(1)
  })

  test('only touches key "8" (shiny, exp, atk bonus unchanged)', () => {
    const data = loadFixture()
    setCaughtShiny(data, [4], true)
    const before = { ...rawEntry(data, 4) }
    setCaughtPokerus(data, [4], POKERUS.Contagious)
    expect(rawEntry(data, 4)).toEqual({ ...before, 8: 2 })
  })
})

describe('in-egg footgun guard', () => {
  test('isInEggOrQueue: false with empty egg list and queue', () => {
    const data = loadFixture()
    ;(data.save as any).breeding = { eggList: [], queueList: [] }
    expect(isInEggOrQueue(data, 4)).toBe(false)
  })

  test('isInEggOrQueue: matches eggList by pokemon id', () => {
    const data = withEgg(loadFixture(), 25)
    expect(isInEggOrQueue(data, 25)).toBe(true)
    expect(isInEggOrQueue(data, 4)).toBe(false)
  })

  test('isInEggOrQueue: matches [type, id] and bare-id queue entries', () => {
    const data = loadFixture()
    ;(data.save as any).breeding = { eggList: [], queueList: [[0, 4], 25, [1, 7]] }
    expect(isInEggOrQueue(data, 4)).toBe(true)
    expect(isInEggOrQueue(data, 25)).toBe(true)
    // [1, 7] is an EggItem entry: 7 is an item type, not a pokémon id.
    expect(isInEggOrQueue(data, 7)).toBe(false)
  })

  test('setCaughtEntry refuses to turn inEgg ON for a pokémon not in an egg or queue', () => {
    const data = loadFixture()
    ;(data.save as any).breeding = { eggList: [], queueList: [] }
    expect(() => setCaughtEntry(data, 4, { inEgg: true })).toThrow(/stuck out of your party/)
    expect('4' in rawEntry(data, 4)).toBe(false)
  })

  test('setCaughtInEgg refuses atomically (no entry touched) if any id is stranded', () => {
    const data = withEgg(loadFixture(), 4)
    expect(() => setCaughtInEgg(data, [4, 25], true)).toThrow(RangeError)
    expect('4' in rawEntry(data, 4)).toBe(false)
    expect('4' in rawEntry(data, 25)).toBe(false)
  })

  test('turning inEgg OFF is always allowed (repair path)', () => {
    const data = loadFixture()
    ;(data.save as any).breeding = { eggList: [], queueList: [] }
    rawEntry(data, 4)['4'] = true
    setCaughtEntry(data, 4, { inEgg: false })
    expect('4' in rawEntry(data, 4)).toBe(false)
  })

  test('re-saving an already-flagged pokémon with inEgg=true is not refused', () => {
    const data = loadFixture()
    ;(data.save as any).breeding = { eggList: [], queueList: [] }
    rawEntry(data, 4)['4'] = true
    expect(() => setCaughtEntry(data, 4, { inEgg: true, exp: 5 })).not.toThrow()
  })
})

// --- EVs (effort points, key "9") -------------------------------------------

const RESISTANT_POINTS = POKERUS_RESISTANT_EVS * EFFORT_POINTS_PER_EV

/** Turn the Slow EVs challenge on (EVs cost 10x the effort points). */
function withSlowEvs(data: ReturnType<typeof loadFixture>) {
  const save = data.save as any
  save.challenges = { list: { ...(save.challenges?.list ?? {}), slowEVs: true } }
  return data
}

const partyJson = (data: ReturnType<typeof loadFixture>) =>
  JSON.stringify((data.save as any).party.caughtPokemon)

describe('EV constants mirror the game', () => {
  test('1000 points per EV, x10 under Slow EVs, Resistant at 50', () => {
    expect(EFFORT_POINTS_PER_EV).toBe(1000)
    expect(SLOW_EVS_EP_MODIFIER).toBe(10)
    expect(POKERUS_RESISTANT_EVS).toBe(50)
  })
})

describe('readCaughtRows — evs', () => {
  test('missing key "9" reads as 0 EVs', () => {
    expect(readCaughtRows(loadFixture()).find((r) => r.id === 4)!.evs).toBe(0)
  })

  test('EVs are effort points / 1000, floored', () => {
    const data = loadFixture()
    rawEntry(data, 4)['9'] = 52836
    rawEntry(data, 25)['9'] = 999
    const rows = readCaughtRows(data)
    expect(rows.find((r) => r.id === 4)!.evs).toBe(52)
    expect(rows.find((r) => r.id === 25)!.evs).toBe(0)
  })

  test('Slow EVs challenge divides by a further 10', () => {
    const data = withSlowEvs(loadFixture())
    rawEntry(data, 4)['9'] = 504479
    expect(readCaughtRows(data).find((r) => r.id === 4)!.evs).toBe(50)
  })

  test('slowEVs explicitly false, or challenges missing entirely, is the normal ratio', () => {
    const data = loadFixture()
    rawEntry(data, 4)['9'] = 50000
    ;(data.save as any).challenges = { list: { slowEVs: false } }
    expect(readCaughtRows(data).find((r) => r.id === 4)!.evs).toBe(50)
    delete (data.save as any).challenges
    expect(readCaughtRows(data).find((r) => r.id === 4)!.evs).toBe(50)
  })

  test('garbage in key "9" reads as 0, not NaN', () => {
    const data = loadFixture()
    rawEntry(data, 4)['9'] = 'lots'
    expect(readCaughtRows(data).find((r) => r.id === 4)!.evs).toBe(0)
  })
})

describe('setCaughtEntry — evs', () => {
  test('writes EVs as effort points to key "9"', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { evs: 75 })
    expect(rawEntry(data, 4)['9']).toBe(75000)
    expect(readCaughtRows(data).find((r) => r.id === 4)!.evs).toBe(75)
  })

  test('Slow EVs: writes 10x the points', () => {
    const data = withSlowEvs(loadFixture())
    setCaughtEntry(data, 4, { evs: 75 })
    expect(rawEntry(data, 4)['9']).toBe(750000)
  })

  test('0 EVs deletes key "9" (the game drops default-valued keys)', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { evs: 3 })
    setCaughtEntry(data, 4, { evs: 0 })
    expect('9' in rawEntry(data, 4)).toBe(false)
  })

  test('unchanged EVs keep the exact points (no rounding down to a whole EV)', () => {
    const data = loadFixture()
    rawEntry(data, 4)['9'] = 52836
    setCaughtEntry(data, 4, { evs: 52 })
    expect(rawEntry(data, 4)['9']).toBe(52836)
  })

  test('0 EVs on a pokémon with sub-EV points keeps those points', () => {
    const data = loadFixture()
    rawEntry(data, 4)['9'] = 999
    setCaughtEntry(data, 4, { evs: 0 })
    expect(rawEntry(data, 4)['9']).toBe(999)
  })

  test('lowering EVs below 50 does not demote a Resistant pokémon', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { pokerus: POKERUS.Resistant })
    setCaughtEntry(data, 4, { evs: 10 })
    expect(rawEntry(data, 4)['8']).toBe(POKERUS.Resistant)
    expect(rawEntry(data, 4)['9']).toBe(10000)
  })

  test('raising EVs to 50+ leaves the pokérus status for the game to promote', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { pokerus: POKERUS.Infected })
    setCaughtEntry(data, 4, { evs: 60 })
    expect(rawEntry(data, 4)['8']).toBe(POKERUS.Infected)
  })

  test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    'rejects evs %s and writes nothing',
    (bad) => {
      const data = loadFixture()
      rawEntry(data, 4)['9'] = 1234
      const before = partyJson(data)
      expect(() => setCaughtEntry(data, 4, { evs: bad })).toThrow(/evs/)
      expect(partyJson(data)).toBe(before)
    },
  )

  test('a bad evs rejects the whole patch (pokerus not half-applied)', () => {
    const data = loadFixture()
    const before = partyJson(data)
    expect(() => setCaughtEntry(data, 4, { pokerus: POKERUS.Resistant, evs: -1 })).toThrow(RangeError)
    expect(partyJson(data)).toBe(before)
  })
})

describe('Resistant raises EVs to 50 (raise-only)', () => {
  test('setCaughtEntry: Resistant on a 0-EV pokémon writes 50 EVs of points', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { pokerus: POKERUS.Resistant })
    expect(rawEntry(data, 4)['8']).toBe(POKERUS.Resistant)
    expect(rawEntry(data, 4)['9']).toBe(RESISTANT_POINTS)
  })

  test('49 EVs (just under) is raised; partial points are replaced by exactly 50 EVs', () => {
    const data = loadFixture()
    rawEntry(data, 4)['9'] = 49999
    setCaughtEntry(data, 4, { pokerus: POKERUS.Resistant })
    expect(rawEntry(data, 4)['9']).toBe(RESISTANT_POINTS)
  })

  test('exactly 50 EVs (boundary) is left untouched', () => {
    const data = loadFixture()
    rawEntry(data, 4)['9'] = 50001
    setCaughtEntry(data, 4, { pokerus: POKERUS.Resistant })
    expect(rawEntry(data, 4)['9']).toBe(50001)
  })

  test('more than 50 EVs is never lowered', () => {
    const data = loadFixture()
    rawEntry(data, 4)['9'] = 504479
    setCaughtEntry(data, 4, { pokerus: POKERUS.Resistant })
    expect(rawEntry(data, 4)['9']).toBe(504479)
  })

  test('Slow EVs: the raise targets 500,000 points', () => {
    const data = withSlowEvs(loadFixture())
    rawEntry(data, 4)['9'] = 50000 // only 5 EVs under the challenge
    setCaughtEntry(data, 4, { pokerus: POKERUS.Resistant })
    expect(rawEntry(data, 4)['9']).toBe(RESISTANT_POINTS * SLOW_EVS_EP_MODIFIER)
  })

  test.each([POKERUS.Uninfected, POKERUS.Infected, POKERUS.Contagious])(
    'pokérus level %s does not touch EVs',
    (level) => {
      const data = loadFixture()
      setCaughtEntry(data, 4, { pokerus: level })
      expect('9' in rawEntry(data, 4)).toBe(false)
    },
  )

  test('same patch with a stale/lower evs still ends at 50 (raise applied last)', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { pokerus: POKERUS.Resistant, evs: 0 })
    expect(rawEntry(data, 4)['9']).toBe(RESISTANT_POINTS)
    setCaughtEntry(data, 25, { pokerus: POKERUS.Resistant, evs: 30 })
    expect(rawEntry(data, 25)['9']).toBe(RESISTANT_POINTS)
  })

  test('same patch with higher evs keeps the higher value', () => {
    const data = loadFixture()
    setCaughtEntry(data, 4, { pokerus: POKERUS.Resistant, evs: 200 })
    expect(rawEntry(data, 4)['9']).toBe(200000)
  })

  test('bulk Resistant raises the low ones and leaves the high ones alone', () => {
    const data = loadFixture()
    rawEntry(data, 25)['9'] = 504479
    setCaughtPokerus(data, [4, 25], POKERUS.Resistant)
    expect(rawEntry(data, 4)['8']).toBe(POKERUS.Resistant)
    expect(rawEntry(data, 25)['8']).toBe(POKERUS.Resistant)
    expect(rawEntry(data, 4)['9']).toBe(RESISTANT_POINTS)
    expect(rawEntry(data, 25)['9']).toBe(504479)
  })

  test('bulk Contagious does not touch EVs', () => {
    const data = loadFixture()
    setCaughtPokerus(data, [4, 25], POKERUS.Contagious)
    expect('9' in rawEntry(data, 4)).toBe(false)
  })
})

describe('setCaughtEvs (bulk)', () => {
  test('writes the EVs to every listed id, skipping missing ids', () => {
    const data = loadFixture()
    setCaughtEvs(data, [4, 99999, 25], 120)
    expect(rawEntry(data, 4)['9']).toBe(120000)
    expect(rawEntry(data, 25)['9']).toBe(120000)
  })

  test('only rewrites entries whose EVs actually change', () => {
    const data = loadFixture()
    rawEntry(data, 4)['9'] = 120777
    setCaughtEvs(data, [4, 25], 120)
    expect(rawEntry(data, 4)['9']).toBe(120777)
    expect(rawEntry(data, 25)['9']).toBe(120000)
  })

  test('0 deletes key "9"', () => {
    const data = loadFixture()
    setCaughtEvs(data, [4], 5)
    setCaughtEvs(data, [4], 0)
    expect('9' in rawEntry(data, 4)).toBe(false)
  })

  test.each([-1, 2.5, Number.NaN])('rejects %s without touching any entry', (bad) => {
    const data = loadFixture()
    const before = partyJson(data)
    expect(() => setCaughtEvs(data, [4, 25], bad)).toThrow(RangeError)
    expect(partyJson(data)).toBe(before)
  })

  test('only touches key "9"', () => {
    const data = loadFixture()
    const before = { ...rawEntry(data, 4) }
    setCaughtEvs(data, [4], 7)
    expect(rawEntry(data, 4)).toEqual({ ...before, 9: 7000 })
  })
})
