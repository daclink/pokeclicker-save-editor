/**
 * Read/write helpers for the Flutes tab.
 *
 * Flutes are stored in `player._itemList` as `<Name>_Flute` keys, e.g.
 * `Yellow_Flute`, `Time_Flute`. In PokeClicker `FluteItem` declares
 * `{ maxAmount: 1 }` — flutes are conceptually owned-or-not, so the
 * stored int is always 0 or 1 and a missing key means "not owned".
 *
 * The 6 enabled flutes (`FluteItemType` in `src/modules/GameConstants.ts`):
 *   Yellow, Black, Time, Red, White, Blue
 *
 * Six more are commented-out in source but reserved as future content
 * (Poke / Azure / Eon / Sun / Moon / Grass). If any future PokeClicker
 * release enables them, they'll show up in `readExtraFlutes` and round-
 * trip via `writeExtraFlutes` without code changes here.
 *
 * Same `_itemList` delete-at-0 discipline as shards: setting a flute
 * to "not owned" removes the key rather than writing 0.
 */
import type { SaveData } from './save'

/** The 6 flutes currently enabled in PokeClicker, in source order. */
export const KNOWN_FLUTES: readonly string[] = [
  'Yellow', 'Black', 'Time', 'Red', 'White', 'Blue',
]

/** Boolean ownership for the canonical 6 flutes. */
export type FluteOwnership = Record<string, boolean>

/** Raw int counts for `*_Flute` keys outside the canonical 6. */
export type FluteCounts = Record<string, number>

function getItemList(data: SaveData): Record<string, unknown> {
  const player = (data.player ?? {}) as Record<string, unknown>
  let items = player._itemList as Record<string, unknown> | undefined
  if (!items) {
    items = {}
    player._itemList = items
    data.player = player
  }
  return items
}

/**
 * Read ownership of the 6 canonical flutes. A flute is "owned" iff
 * its `<Name>_Flute` key is present in `_itemList` with a numeric
 * value >= 1 (handles the int-vs-bool drift noted in `cmd_berry`).
 */
export function readKnownFlutes(data: SaveData): FluteOwnership {
  const items = getItemList(data)
  const out: FluteOwnership = {}
  for (const name of KNOWN_FLUTES) {
    const v = items[`${name}_Flute`]
    out[name] = typeof v === 'number' ? v >= 1 : false
  }
  return out
}

/**
 * Surface any `*_Flute` keys in `_itemList` that aren't one of the
 * 6 canonical names — future-proofs against the commented-out flutes
 * in `FluteItemType` being enabled later. Keys map to their raw int
 * count rather than booleans, in case PokeClicker ever loosens the
 * `maxAmount: 1` cap.
 */
export function readExtraFlutes(data: SaveData): FluteCounts {
  const items = getItemList(data)
  const known = new Set(KNOWN_FLUTES.map((n) => `${n}_Flute`))
  const out: FluteCounts = {}
  for (const [key, value] of Object.entries(items)) {
    if (key.endsWith('_Flute') && !known.has(key) && typeof value === 'number') {
      out[key] = value
    }
  }
  return out
}

/**
 * Write ownership back. `true` writes `<Name>_Flute = 1`; `false` deletes
 * the key entirely, matching the game's "no zero counts in `_itemList`"
 * persistence convention. Unknown names are ignored (protects against
 * typo'd UI input).
 */
export function writeKnownFlutes(data: SaveData, edits: FluteOwnership): void {
  const items = getItemList(data)
  for (const name of KNOWN_FLUTES) {
    if (!(name in edits)) continue
    const owned = edits[name]
    const key = `${name}_Flute`
    if (owned) items[key] = 1
    else delete items[key]
  }
}

/**
 * Write the extras panel back. Numeric here so future PokeClicker
 * flutes can carry counts > 1 if the cap is ever loosened. Same
 * delete-at-0 rule as `writeKnownFlutes` / the shards helpers.
 */
export function writeExtraFlutes(data: SaveData, edits: FluteCounts): void {
  const items = getItemList(data)
  for (const [key, v] of Object.entries(edits)) {
    if (!Number.isInteger(v) || v < 0) {
      throw new RangeError(`${key}: expected non-negative integer, got ${v}`)
    }
    if (v === 0) delete items[key]
    else items[key] = v
  }
}
