/**
 * Read/write helpers for the Gems tab.
 *
 * Gems live at `save.gems.gemWallet` as a *positional* array of integers,
 * indexed by the PokeClicker `PokemonType` enum (0 = Normal … 17 = Fairy).
 * Unlike shards (keyed dict in `player._itemList`) there's no "delete at 0"
 * trick — position 5 must stay at position 5, so a 0 stays a 0.
 *
 * The schema test (`tests/test_schema.py::test_gem_wallet`) only asserts
 * `len(wallet) >= 18`, leaving room for PokeClicker to add a 19th type
 * (e.g. Stellar) later. We surface any trailing entries as "extras" and
 * preserve them on write, never truncating the underlying array.
 */
import type { SaveData } from './save'

/** The 18 PokeClicker types in canonical `PokemonType` enum order. */
export const KNOWN_GEM_TYPES: readonly string[] = [
  'Normal',   'Fighting', 'Flying', 'Poison',  // 0–3
  'Ground',   'Rock',     'Bug',    'Ghost',   // 4–7
  'Steel',    'Fire',     'Water',  'Grass',   // 8–11
  'Electric', 'Psychic',  'Ice',    'Dragon',  // 12–15
  'Dark',     'Fairy',                         // 16–17
]

export type GemCounts = Record<string, number>

function getGemWallet(data: SaveData): number[] {
  const save = (data.save ?? {}) as Record<string, unknown>
  let gems = save.gems as Record<string, unknown> | undefined
  if (!gems) {
    gems = {}
    save.gems = gems
    data.save = save
  }
  let wallet = gems.gemWallet as number[] | undefined
  if (!Array.isArray(wallet)) {
    wallet = Array<number>(KNOWN_GEM_TYPES.length).fill(0)
    gems.gemWallet = wallet
  }
  // Pad short wallets up to 18 so callers can rely on every known index.
  while (wallet.length < KNOWN_GEM_TYPES.length) wallet.push(0)
  return wallet
}

/** Read counts for the 18 canonical types. */
export function readKnownGems(data: SaveData): GemCounts {
  const wallet = getGemWallet(data)
  const out: GemCounts = {}
  KNOWN_GEM_TYPES.forEach((name, i) => {
    const v = wallet[i]
    out[name] = typeof v === 'number' ? v : 0
  })
  return out
}

/**
 * Return any wallet entries beyond index 17 — surfaced as
 * `{ 'Type #18': n, 'Type #19': n, ... }`. Lets us round-trip future
 * PokeClicker types without truncating the save.
 */
export function readExtraGems(data: SaveData): GemCounts {
  const wallet = getGemWallet(data)
  const out: GemCounts = {}
  for (let i = KNOWN_GEM_TYPES.length; i < wallet.length; i++) {
    const v = wallet[i]
    out[`Type #${i}`] = typeof v === 'number' ? v : 0
  }
  return out
}

function validate(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 0) {
    throw new RangeError(`${name}: expected non-negative integer, got ${v}`)
  }
}

/**
 * Write back into the canonical 18 positions. Ignores names that aren't
 * in `KNOWN_GEM_TYPES` (mirrors how `writeKnownShards` ignores unknown
 * keys — protects against typo'd inputs from the UI).
 */
export function writeKnownGems(data: SaveData, edits: GemCounts): void {
  const wallet = getGemWallet(data)
  for (const [name, v] of Object.entries(edits)) {
    const idx = KNOWN_GEM_TYPES.indexOf(name)
    if (idx < 0) continue
    validate(`gem[${name}]`, v)
    wallet[idx] = v
  }
}

/**
 * Write trailing forward-compat positions back. Keys must be of the form
 * `'Type #<n>'` where `n >= 18` — anything else is ignored.
 */
export function writeExtraGems(data: SaveData, edits: GemCounts): void {
  const wallet = getGemWallet(data)
  for (const [name, v] of Object.entries(edits)) {
    const m = /^Type #(\d+)$/.exec(name)
    if (!m) continue
    const idx = Number.parseInt(m[1], 10)
    if (idx < KNOWN_GEM_TYPES.length) continue
    validate(name, v)
    while (wallet.length <= idx) wallet.push(0)
    wallet[idx] = v
  }
}
