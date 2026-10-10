/**
 * Pokédex mark-caught helpers — web port of pcedit_gui.PokedexTab.
 *
 * "Marking caught" appends a minimal entry to `save.party.caughtPokemon`:
 *   { "2": { "0": 0, "1": 0, "2": 0 }, "3": 1, id: <pid> }
 * i.e. zeroed vitamins (key "2"), exp (key "3") = 1, and the dex id. Entries
 * that already exist are left untouched (re-marking is a no-op).
 *
 * The optional stat bump mirrors the desktop's `_bump_stats`: it keeps the
 * Trainer Card counters consistent with the dex when the user opts in. It is
 * off by default because it changes Trainer Card numbers (and, downstream,
 * achievement progress).
 */
import { POKEMON_FORMS, nameFor, statBucketFor } from './data'
import type { RegionRange } from './data'
import type { SaveData } from './save'

/** Exp written into a freshly marked-caught entry (matches desktop default). */
const NEW_ENTRY_EXP = 1

export type DexRow = { pid: number; name: string; caught: boolean }

export type RowOptions = {
  /**
   * Also list each species' alternate forms (fractional ids such as Unown
   * `201.06` or Alcremie `869.04`) right after the base species. Default false.
   */
  includeForms?: boolean
}

export type MarkOptions = {
  /** Also bump `save.statistics` capture counters. Default false. */
  bumpStats?: boolean
}

// --- form index --------------------------------------------------------------

/**
 * Base species id → its form ids, numerically sorted (`869.09` before
 * `869.1`). Built once from the static form table. Forms are grouped by base
 * id, so a regional form (Alolan Raichu) lists under its base species'
 * region, not its native one.
 */
const FORMS_BY_BASE: ReadonlyMap<number, readonly number[]> = (() => {
  const map = new Map<number, number[]>()
  for (const key of Object.keys(POKEMON_FORMS)) {
    const pid = Number(key)
    if (!Number.isFinite(pid)) continue
    const base = Math.trunc(pid)
    const list = map.get(base)
    if (list) list.push(pid)
    else map.set(base, [pid])
  }
  for (const list of map.values()) list.sort((a, b) => a - b)
  return map
})()

const NO_FORMS: readonly number[] = []

/** Form ids of a base species (empty if it has none). */
export function formsOf(base: number): readonly number[] {
  return FORMS_BY_BASE.get(base) ?? NO_FORMS
}

// --- accessors --------------------------------------------------------------

function caughtParty(data: SaveData): Array<Record<string, unknown>> {
  const save = data.save as Record<string, unknown> | undefined
  const party = save?.party as Record<string, unknown> | undefined
  const list = party?.caughtPokemon as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(list)) {
    throw new Error('save.party.caughtPokemon is missing or not an array')
  }
  return list
}

function asInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0
}

// --- reads ------------------------------------------------------------------

/** Set of national-dex ids already present in the party. */
export function caughtIdSet(data: SaveData): Set<number> {
  const out = new Set<number>()
  for (const e of caughtParty(data)) {
    if (e && typeof e.id === 'number') out.add(e.id)
  }
  return out
}

/**
 * Rows for a region's dex (one per id in `[lo, hi]`, plus each species' forms
 * when `includeForms` is set). With `uncaughtOnly`, already-caught ids are
 * omitted. Pure read — never touches `data`.
 */
export function regionRows(
  data: SaveData,
  region: RegionRange,
  uncaughtOnly = false,
  opts: RowOptions = {},
): DexRow[] {
  const caught = caughtIdSet(data)
  const rows: DexRow[] = []
  const push = (pid: number): void => {
    const isCaught = caught.has(pid)
    if (uncaughtOnly && isCaught) return
    rows.push({ pid, name: nameFor(pid), caught: isCaught })
  }
  for (let base = region.lo; base <= region.hi; base++) {
    push(base)
    if (opts.includeForms) for (const form of formsOf(base)) push(form)
  }
  return rows
}

// --- writes -----------------------------------------------------------------

/**
 * Append caught entries for any `ids` not already in the party. Returns the
 * number of entries actually added. With `bumpStats`, also updates the
 * `save.statistics` capture counters for the newly-added ids.
 */
export function markCaught(
  data: SaveData,
  ids: number[],
  opts: MarkOptions = {},
): number {
  const party = caughtParty(data)
  const existing = caughtIdSet(data)
  const added: number[] = []
  for (const pid of ids) {
    if (existing.has(pid)) continue
    party.push({ '2': { '0': 0, '1': 0, '2': 0 }, '3': NEW_ENTRY_EXP, id: pid })
    existing.add(pid)
    added.push(pid)
  }
  if (added.length && opts.bumpStats) bumpCaptureStats(data, added)
  return added.length
}

/**
 * Update `save.statistics` so the Trainer Card matches the dex, for each
 * newly-marked id:
 *   - `pokemonCaptured[id]` / `pokemonEncountered[id]` set to `max(1, current)`
 *   - the species' gender bucket (Male/Female/Genderless) +1 for both the
 *     Captured and Encountered buckets (ids outside the table credit only the
 *     gender-neutral total)
 *   - `totalPokemonCaptured` / `totalPokemonEncountered` += `ids.length`
 */
function bumpCaptureStats(data: SaveData, ids: number[]): void {
  const save = data.save as Record<string, unknown>
  const stats = (save.statistics ??= {}) as Record<string, unknown>
  const captured = (stats.pokemonCaptured ??= {}) as Record<string, number>
  const encountered = (stats.pokemonEncountered ??= {}) as Record<string, number>

  for (const pid of ids) {
    const key = String(pid)
    captured[key] = Math.max(1, asInt(captured[key]))
    encountered[key] = Math.max(1, asInt(encountered[key]))

    const capBucket = statBucketFor(pid)
    if (capBucket) {
      const encBucket = capBucket.replace('Captured', 'Encountered')
      stats[capBucket] = asInt(stats[capBucket]) + 1
      stats[encBucket] = asInt(stats[encBucket]) + 1
    }
  }

  stats.totalPokemonCaptured = asInt(stats.totalPokemonCaptured) + ids.length
  stats.totalPokemonEncountered = asInt(stats.totalPokemonEncountered) + ids.length
}
