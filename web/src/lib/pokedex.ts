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
import { nameFor, statBucketFor } from './data'
import type { RegionRange } from './data'
import type { SaveData } from './save'

/** Exp written into a freshly marked-caught entry (matches desktop default). */
const NEW_ENTRY_EXP = 1

export type DexRow = { pid: number; name: string; caught: boolean }

export type MarkOptions = {
  /** Also bump `save.statistics` capture counters. Default false. */
  bumpStats?: boolean
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
 * Rows for a region's dex (one per id in `[lo, hi]`). With `uncaughtOnly`,
 * already-caught ids are omitted.
 */
export function regionRows(
  data: SaveData,
  region: RegionRange,
  uncaughtOnly = false,
): DexRow[] {
  const caught = caughtIdSet(data)
  const rows: DexRow[] = []
  for (let pid = region.lo; pid <= region.hi; pid++) {
    const isCaught = caught.has(pid)
    if (uncaughtOnly && isCaught) continue
    rows.push({ pid, name: nameFor(pid), caught: isCaught })
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
