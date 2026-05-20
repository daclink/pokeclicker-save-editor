/**
 * Read/write helpers for the Caught Pokémon tab — port of
 * pcedit_gui.CaughtTab and CaughtDialog.
 *
 * Save shape (under `save.party.caughtPokemon`):
 *
 *   [
 *     {
 *       id:  pokédex id (int),
 *       "0": attack bonus from hatching (25 = first hatch tier),
 *       "1": pokerus state (0..4),
 *       "2": EVs by attack type (dict; the editor does not touch this),
 *       "3": total exp,
 *       "4": (optional bool) currently in egg / breeding-pending,
 *       "5": (optional bool) resistant flag,
 *     },
 *     ...
 *   ]
 *
 * The desktop tab preserves the "key absent" vs "value false" distinction
 * for the `4` and `5` flags: setting either to false **removes** the key.
 * That matches what real saves look like (the game writes the keys only
 * when the flags are true) and keeps round-trips clean. We mirror that
 * here.
 */
import { nameFor } from './data'
import type { SaveData } from './save'

// --- types ------------------------------------------------------------------

export type CaughtRow = {
  id: number
  name: string
  atkBonus: number   // "0"
  pokerus: number    // "1"
  exp: number        // "3"
  inEgg: boolean     // "4" — true iff key present and truthy
  resistant: boolean // "5" — true iff key present and truthy
}

/** Patch shape applied by the edit dialog. Optional fields are skipped. */
export type CaughtPatch = {
  atkBonus?: number
  pokerus?: number
  exp?: number
  inEgg?: boolean
  resistant?: boolean
}

// --- accessors --------------------------------------------------------------

function getParty(data: SaveData): Array<Record<string, unknown>> {
  const save = data.save as Record<string, unknown> | undefined
  const party = save?.party as Record<string, unknown> | undefined
  const list = party?.caughtPokemon as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(list)) {
    throw new Error('save.party.caughtPokemon is missing or not an array')
  }
  return list
}

function findEntry(
  data: SaveData,
  id: number,
): Record<string, unknown> | null {
  for (const entry of getParty(data)) {
    if (entry && entry.id === id) return entry
  }
  return null
}

function requireEntry(data: SaveData, id: number): Record<string, unknown> {
  const entry = findEntry(data, id)
  if (!entry) throw new RangeError(`no caught pokémon with id ${id}`)
  return entry
}

function asInt(v: unknown): number {
  // Saves occasionally serialise ints as floats; truncate defensively.
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  return 0
}

function ensureNonNegInt(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 0) {
    throw new RangeError(`${name}: expected non-negative integer, got ${v}`)
  }
}

// --- public reads -----------------------------------------------------------

export function readCaughtRows(data: SaveData): CaughtRow[] {
  const out: CaughtRow[] = []
  for (const entry of getParty(data)) {
    if (!entry || typeof entry !== 'object') continue
    const id = typeof entry.id === 'number' ? entry.id : Number(entry.id)
    if (!Number.isFinite(id)) continue
    out.push({
      id,
      name: nameFor(id),
      atkBonus: asInt(entry['0']),
      pokerus: asInt(entry['1']),
      exp: asInt(entry['3']),
      inEgg: Boolean(entry['4']),
      resistant: Boolean(entry['5']),
    })
  }
  return out
}

// --- public writes ----------------------------------------------------------

/**
 * Apply a patch to a single caught entry. Numeric fields get written
 * straight; `inEgg` and `resistant` follow the desktop's
 * key-present-iff-true rule.
 */
export function setCaughtEntry(
  data: SaveData,
  id: number,
  patch: CaughtPatch,
): void {
  const entry = requireEntry(data, id)
  if (patch.atkBonus !== undefined) {
    ensureNonNegInt('atkBonus', patch.atkBonus)
    entry['0'] = patch.atkBonus
  }
  if (patch.pokerus !== undefined) {
    ensureNonNegInt('pokerus', patch.pokerus)
    entry['1'] = patch.pokerus
  }
  if (patch.exp !== undefined) {
    ensureNonNegInt('exp', patch.exp)
    entry['3'] = patch.exp
  }
  if (patch.inEgg !== undefined) {
    if (patch.inEgg) entry['4'] = true
    else delete entry['4']
  }
  if (patch.resistant !== undefined) {
    if (patch.resistant) entry['5'] = true
    else delete entry['5']
  }
}

/** Bulk: set `resistant` on multiple ids. Off → delete the key (no `false`). */
export function setCaughtResistant(
  data: SaveData,
  ids: number[],
  on: boolean,
): void {
  for (const id of ids) {
    const entry = findEntry(data, id)
    if (!entry) continue // tolerate missing ids — saves can change between renders
    if (on) entry['5'] = true
    else delete entry['5']
  }
}

/** Bulk: set `inEgg` on multiple ids. Off → delete the key. */
export function setCaughtInEgg(
  data: SaveData,
  ids: number[],
  on: boolean,
): void {
  for (const id of ids) {
    const entry = findEntry(data, id)
    if (!entry) continue
    if (on) entry['4'] = true
    else delete entry['4']
  }
}

/** Bulk: set `atkBonus` on multiple ids. */
export function setCaughtAtkBonus(
  data: SaveData,
  ids: number[],
  n: number,
): void {
  ensureNonNegInt('atkBonus', n)
  for (const id of ids) {
    const entry = findEntry(data, id)
    if (!entry) continue
    entry['0'] = n
  }
}
