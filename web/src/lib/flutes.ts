/**
 * Read/write helpers for the Flutes tab.
 *
 * Flutes are stored in `player._itemList` as `<Name>_Flute` keys, e.g.
 * `Yellow_Flute`, `Time_Flute`. In PokeClicker `FluteItem` declares
 * `{ maxAmount: 1 }` — flutes are conceptually owned-or-not, so the
 * stored int is always 0 or 1 and a missing key means "not owned".
 *
 * **Active flutes live elsewhere.** Using a flute consumes it from
 * `_itemList` and `FluteEffectRunner.toggleEffect` stores a gem budget in
 * `player.effectList[<Name>_Flute]` (ticks down while it runs). A flute is
 * active iff that entry is truthy (`FluteEffectRunner.isActive`), and the
 * shop counts it as owned in either place (`FluteItem.isSoldOut`).
 * Turning it off (`removeEffect`) zeroes the entry and calls
 * `player.gainItem(name, 1)`, handing the flute back. So:
 *   - giving an active flute must NOT write `_itemList` (that copy plus
 *     the one handed back = two of a `maxAmount: 1` item);
 *   - removing an active flute deletes its `effectList` key too. The game
 *     drops falsy `effectList` entries on save (`Player.toJSON`) and
 *     recounts active flutes from `isActive` on load, so a missing key is
 *     a clean "off" — and `removeEffect` never runs, so nothing comes back.
 * `effectList` also holds non-flute battle-item effects (e.g. `xAttack`);
 * only `<Name>_Flute` keys are ever touched here.
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

/** Suffix every flute item key carries (`<Name>_Flute`). */
const FLUTE_KEY_SUFFIX = '_Flute'

/** `_itemList` count at which a flute counts as owned. */
const OWNED_MIN_COUNT = 1

/** Count written to `_itemList` when giving a flute (`FluteItem` maxAmount). */
const FLUTE_MAX_AMOUNT = 1

/** Where a known flute is in the save. */
export const FLUTE_STATE = {
  /** In neither `_itemList` nor `effectList`. */
  NotOwned: 'not-owned',
  /** In `_itemList`, not running. */
  Owned: 'owned',
  /** Running: has a positive `effectList` gem budget. */
  Active: 'active',
} as const

export type FluteState = (typeof FLUTE_STATE)[keyof typeof FLUTE_STATE]

/** Per-flute state for the canonical 6, plus duplicated flutes. */
export interface FluteStatus {
  states: Record<string, FluteState>
  /**
   * Flutes that are active AND still have an `_itemList` copy (left by an
   * older editor's "Give all"). When the effect ends the game adds another,
   * so the player would hold two. In `KNOWN_FLUTES` order.
   */
  duplicates: string[]
}

/** Boolean ownership (owned or active) for the canonical 6 flutes. */
export type FluteOwnership = Record<string, boolean>

/** Raw int counts for `*_Flute` keys outside the canonical 6. */
export type FluteCounts = Record<string, number>

type Bag = Record<string, unknown>

const fluteKey = (name: string): string => `${name}${FLUTE_KEY_SUFFIX}`

// --- accessors --------------------------------------------------------------
//
// Readers ("peek") never write: the tab calls them inside Svelte `$derived`,
// where mutating `$state` throws `state_unsafe_mutation`. Only the write
// helpers ("ensure") create a missing `_itemList`. `effectList` is never
// created — no entry already means "not active".

function peekPlayerBag(data: SaveData, key: string): Bag | undefined {
  const player = data.player as Bag | undefined
  const bag = player?.[key]
  return bag && typeof bag === 'object' ? (bag as Bag) : undefined
}

const peekItemList = (data: SaveData) => peekPlayerBag(data, '_itemList')
const peekEffectList = (data: SaveData) => peekPlayerBag(data, 'effectList')

function ensureItemList(data: SaveData): Bag {
  const player = (data.player ?? {}) as Bag
  let items = player._itemList as Bag | undefined
  if (!items) {
    items = {}
    player._itemList = items
    data.player = player
  }
  return items
}

function isActive(effects: Bag | undefined, name: string): boolean {
  const v = effects?.[fluteKey(name)]
  return typeof v === 'number' && v > 0
}

/** Numeric value >= 1 (handles the int-vs-bool drift noted in `cmd_berry`). */
function inItemList(items: Bag | undefined, name: string): boolean {
  const v = items?.[fluteKey(name)]
  return typeof v === 'number' && v >= OWNED_MIN_COUNT
}

// --- reads ------------------------------------------------------------------

/**
 * State of each canonical flute. Active wins over owned; a flute that is
 * both is also listed in `duplicates`.
 */
export function readFluteStatus(data: SaveData): FluteStatus {
  const items = peekItemList(data)
  const effects = peekEffectList(data)
  const states: Record<string, FluteState> = {}
  const duplicates: string[] = []
  for (const name of KNOWN_FLUTES) {
    const active = isActive(effects, name)
    const owned = inItemList(items, name)
    if (active) {
      states[name] = FLUTE_STATE.Active
      if (owned) duplicates.push(name)
    } else {
      states[name] = owned ? FLUTE_STATE.Owned : FLUTE_STATE.NotOwned
    }
  }
  return { states, duplicates }
}

/**
 * Read ownership of the 6 canonical flutes as booleans: `true` when the
 * flute is in `_itemList` or currently active (`FluteItem.isSoldOut`).
 */
export function readKnownFlutes(data: SaveData): FluteOwnership {
  const { states } = readFluteStatus(data)
  const out: FluteOwnership = {}
  for (const name of KNOWN_FLUTES) out[name] = states[name] !== FLUTE_STATE.NotOwned
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
  const items = peekItemList(data)
  const out: FluteCounts = {}
  if (!items) return out
  const known = new Set(KNOWN_FLUTES.map(fluteKey))
  for (const [key, value] of Object.entries(items)) {
    if (key.endsWith(FLUTE_KEY_SUFFIX) && !known.has(key) && typeof value === 'number') {
      out[key] = value
    }
  }
  return out
}

// --- writes -----------------------------------------------------------------

/**
 * Write ownership back. Unknown names are ignored (protects against
 * typo'd UI input).
 *
 * - `true`, not active: `<Name>_Flute = 1` in `_itemList`.
 * - `true`, active: the running flute already is the player's one copy, so
 *   `_itemList` must not hold it — any copy there is a duplicate and is
 *   removed. (This is how "Give all" repairs duplicates.)
 * - `false`: deletes the `_itemList` key (no zero counts, as the game
 *   persists it) and the `effectList` key, turning an active flute off
 *   without the game handing it back.
 */
export function writeKnownFlutes(data: SaveData, edits: FluteOwnership): void {
  const items = ensureItemList(data)
  const effects = peekEffectList(data)
  for (const name of KNOWN_FLUTES) {
    if (!(name in edits)) continue
    const key = fluteKey(name)
    if (!edits[name]) {
      delete items[key]
      if (effects) delete effects[key]
    } else if (isActive(effects, name)) {
      delete items[key]
    } else {
      items[key] = FLUTE_MAX_AMOUNT
    }
  }
}

/**
 * Drop the `_itemList` copy of every flute that is also active (see
 * `FluteStatus.duplicates`). Leaves the running effect alone.
 */
export function repairDuplicateFlutes(data: SaveData): void {
  const items = peekItemList(data)
  if (!items) return
  for (const name of readFluteStatus(data).duplicates) delete items[fluteKey(name)]
}

/**
 * Write the extras panel back. Numeric here so future PokeClicker
 * flutes can carry counts > 1 if the cap is ever loosened. Same
 * delete-at-0 rule as `writeKnownFlutes` / the shards helpers.
 */
export function writeExtraFlutes(data: SaveData, edits: FluteCounts): void {
  const items = ensureItemList(data)
  for (const [key, v] of Object.entries(edits)) {
    if (!Number.isInteger(v) || v < 0) {
      throw new RangeError(`${key}: expected non-negative integer, got ${v}`)
    }
    if (v === 0) delete items[key]
    else items[key] = v
  }
}
