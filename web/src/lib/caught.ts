/**
 * Read/write helpers for the Caught Pokémon tab.
 *
 * Save shape (under `save.party.caughtPokemon`). Numeric keys are the
 * canonical PokeClicker `PartyPokemonSaveKeys` enum — only the ones the
 * editor touches are listed; the rest are preserved untouched:
 *
 *   [
 *     {
 *       id:  pokédex id (int),
 *       "0": attackBonusPercent — hatch bonus (25 = first hatch tier),
 *       "1": attackBonusAmount  — flat attack bonus (NOT edited; preserved),
 *       "2": vitaminsUsed       — dict (NOT edited; preserved),
 *       "3": exp                — total exp,
 *       "4": (optional bool) breeding — currently in the hatchery/egg,
 *       "5": (optional bool) shiny,
 *       "8": pokerus state — Pokerus enum 0..3
 *            (0 Uninfected, 1 Infected, 2 Contagious, 3 Resistant),
 *     },
 *     ...
 *   ]
 *
 * Pokerus lives at key "8" — earlier versions of this editor read it from
 * "1" (attackBonusAmount), which surfaced large numbers as "pokerus".
 *
 * The "4" (breeding/in-egg) and "5" (shiny) flags follow the "key absent"
 * vs "value false" distinction: setting either to false **removes** the
 * key. That matches what real saves look like (the game writes the keys
 * only when true) and keeps byte-identical round-trips clean.
 */
import { nameFor } from './data'
import type { SaveData } from './save'

// --- types ------------------------------------------------------------------

export type CaughtRow = {
  id: number
  name: string
  atkBonus: number // "0"
  pokerus: number  // "8" — Pokerus enum 0..3
  exp: number      // "3"
  inEgg: boolean   // "4" (breeding) — true iff key present and truthy
  shiny: boolean   // "5" — true iff key present and truthy
}

/** Patch shape applied by the edit dialog. Optional fields are skipped. */
export type CaughtPatch = {
  atkBonus?: number
  pokerus?: number
  exp?: number
  inEgg?: boolean
  shiny?: boolean
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

/** Pokerus is the PokeClicker Pokerus enum: 0..3. */
function ensurePokerus(v: number): void {
  if (!Number.isInteger(v) || v < 0 || v > 3) {
    throw new RangeError(`pokerus: expected integer 0..3 (Uninfected..Resistant), got ${v}`)
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
      pokerus: asInt(entry['8']),
      exp: asInt(entry['3']),
      inEgg: Boolean(entry['4']),
      shiny: Boolean(entry['5']),
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
    ensurePokerus(patch.pokerus)
    entry['8'] = patch.pokerus
  }
  if (patch.exp !== undefined) {
    ensureNonNegInt('exp', patch.exp)
    entry['3'] = patch.exp
  }
  if (patch.inEgg !== undefined) {
    if (patch.inEgg) entry['4'] = true
    else delete entry['4']
  }
  if (patch.shiny !== undefined) {
    if (patch.shiny) entry['5'] = true
    else delete entry['5']
  }
}

/** Bulk: set `shiny` (key "5") on multiple ids. Off → delete the key (no `false`). */
export function setCaughtShiny(
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
