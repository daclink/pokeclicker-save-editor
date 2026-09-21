/**
 * Read/write helpers for the Inventory tab: egg items, evolution items and
 * mega stones — all plain counts in `player._itemList`.
 *
 * Mirrors PokeClicker's `Player.ts`: on load every known item starts at 0
 * and saved keys overlay it; on save, zero counts are deleted. So a missing
 * key reads as 0 and writing 0 deletes the key (same discipline as
 * `shards.ts`). A mega stone is owned iff its count is > 0; the game only
 * ever writes 1, so owning writes exactly 1.
 *
 * Keys outside the rosters passed in are never touched.
 */
import { MEGA_STONES, NATIONAL_NAMES } from './data'
import { caughtIdSet } from './pokedex'
import type { SaveData } from './save'

/** Count the game stores for an owned mega stone (`MegaStoneItem.maxAmount`). */
export const MEGA_STONE_OWNED_COUNT = 1

const MEGA_STONE_NAMES: ReadonlySet<string> = new Set(MEGA_STONES.map((m) => m.stone))

export type ItemCounts = Record<string, number>

export type MegaStoneRow = {
  stone: string
  base: string
  owned: boolean
  /** Whether the base species itself (exact id, not a form) is in the party. */
  baseCaught: boolean
}

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

function ensureCount(key: string, n: number): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`${key}: expected non-negative integer, got ${n}`)
  }
}

function ensureMegaStone(stone: string): void {
  if (!MEGA_STONE_NAMES.has(stone)) {
    throw new RangeError(`${stone} is not a mega stone`)
  }
}

function writeCount(items: Record<string, unknown>, key: string, n: number): void {
  if (n === 0) delete items[key]
  else items[key] = n
}

/** National-dex id of a mega stone's base species (by name), or `null`. */
export function megaStoneBaseId(base: string): number | null {
  const idx = NATIONAL_NAMES.indexOf(base)
  return idx === -1 ? null : idx + 1
}

// --- counts (egg items, evolution items) --------------------------------------

/** Counts for `keys`; missing entries read as 0. */
export function readItemCounts(data: SaveData, keys: readonly string[]): ItemCounts {
  const items = getItemList(data)
  const out: ItemCounts = {}
  for (const key of keys) {
    const v = items[key]
    out[key] = typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return out
}

/** Set one item's count; 0 deletes the key. */
export function setItemCount(data: SaveData, key: string, n: number): void {
  ensureCount(key, n)
  writeCount(getItemList(data), key, n)
}

/** Set the same count on many items (validated before any write). */
export function setItemCounts(data: SaveData, keys: readonly string[], n: number): void {
  ensureCount('item count', n)
  const items = getItemList(data)
  for (const key of keys) writeCount(items, key, n)
}

// --- mega stones --------------------------------------------------------------

/** One row per mega stone in roster order. */
export function readMegaStones(data: SaveData): MegaStoneRow[] {
  const items = getItemList(data)
  const caught = caughtIdSet(data)
  return MEGA_STONES.map(({ stone, base }) => {
    const v = items[stone]
    const baseId = megaStoneBaseId(base)
    return {
      stone,
      base,
      owned: typeof v === 'number' && v > 0,
      baseCaught: baseId !== null && caught.has(baseId),
    }
  })
}

/** Give (writes exactly 1) or remove (deletes the key) one mega stone. */
export function setMegaStone(data: SaveData, stone: string, owned: boolean): void {
  setMegaStones(data, [stone], owned)
}

/** Give or remove many mega stones; every name is validated before any write. */
export function setMegaStones(data: SaveData, stones: readonly string[], owned: boolean): void {
  for (const stone of stones) ensureMegaStone(stone)
  const items = getItemList(data)
  for (const stone of stones) writeCount(items, stone, owned ? MEGA_STONE_OWNED_COUNT : 0)
}
