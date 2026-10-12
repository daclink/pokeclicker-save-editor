/**
 * Read/write helpers for the Shards tab — port of pcedit_gui.ShardsTab.
 *
 * Shards are stored in `player._itemList` as `<Color>_shard` keys (e.g.
 * `Red_shard`, `Cyan_shard`). The grid lists every shard colour the
 * game's Underground yields (KNOWN_SHARD_COLORS); any other `*_shard` keys that
 * aren't predeclared show up in a separate "Other" panel below the grid.
 *
 * Both runtimes share the same write-time discipline: an entry whose
 * value is exactly 0 is **deleted** from `_itemList` rather than written,
 * to match real saves (the game never persists a 0-count item) and to
 * keep fresh saves clean.
 */
import { UNDERGROUND_ITEMS } from './data'
import type { SaveData } from './save'

/** Suffix on every shard's `_itemList` key (`Red` → `Red_shard`). */
const SHARD_KEY_SUFFIX = '_shard'

/** Every shard colour the Underground can yield, in the game's order
 *  (generated from UndergroundItems.ts, not hand-kept). */
export const KNOWN_SHARD_COLORS: readonly string[] = UNDERGROUND_ITEMS
  .filter((i) => i.valueType === 'Shard')
  .map((i) => i.key.slice(0, -SHARD_KEY_SUFFIX.length))

export type ShardCounts = Record<string, number>

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

/** Read counts for every known colour. Missing entries default to 0. */
export function readKnownShards(data: SaveData): ShardCounts {
  const items = getItemList(data)
  const out: ShardCounts = {}
  for (const color of KNOWN_SHARD_COLORS) {
    const key = `${color}${SHARD_KEY_SUFFIX}`
    const v = items[key]
    out[color] = typeof v === 'number' ? v : 0
  }
  return out
}

/**
 * Return any `*_shard` keys present in `_itemList` that are NOT one of the
 * known colours — same surface as the desktop tab's "Other" panel.
 * Keyed by the full item name (e.g. `Sapphire_shard`), value is the count.
 */
export function readExtraShards(data: SaveData): ShardCounts {
  const items = getItemList(data)
  const known = new Set(KNOWN_SHARD_COLORS.map((c) => `${c}${SHARD_KEY_SUFFIX}`))
  const out: ShardCounts = {}
  for (const [key, value] of Object.entries(items)) {
    if (key.endsWith(SHARD_KEY_SUFFIX) && !known.has(key) && typeof value === 'number') {
      out[key] = value
    }
  }
  return out
}

/**
 * Write the canonical-colour grid back to `_itemList`. Rows at 0 are
 * deleted from the dict — matches the desktop tab and the game's "no
 * zero counts" persistence convention.
 *
 * Non-shard entries in `_itemList` (potions, balls, etc.) are left
 * completely alone.
 */
export function writeKnownShards(data: SaveData, edits: ShardCounts): void {
  const items = getItemList(data)
  for (const color of KNOWN_SHARD_COLORS) {
    const key = `${color}${SHARD_KEY_SUFFIX}`
    const v = edits[color]
    if (v === undefined) continue
    if (!Number.isInteger(v) || v < 0) {
      throw new RangeError(`${key}: expected non-negative integer, got ${v}`)
    }
    if (v === 0) delete items[key]
    else items[key] = v
  }
}

/**
 * Write the extras panel back (same delete-at-0 rule). Only touches the
 * keys passed in; doesn't try to validate that they end with `_shard` —
 * the UI only ever feeds in keys readExtraShards surfaced.
 */
export function writeExtraShards(data: SaveData, edits: ShardCounts): void {
  const items = getItemList(data)
  for (const [key, v] of Object.entries(edits)) {
    if (!Number.isInteger(v) || v < 0) {
      throw new RangeError(`${key}: expected non-negative integer, got ${v}`)
    }
    if (v === 0) delete items[key]
    else items[key] = v
  }
}
