/**
 * Read/write helpers for the Currencies & Multipliers tab.
 *
 * Mirrors `pcedit_gui.CurrenciesTab` (read on load, write on save) so the
 * Python and browser editors keep the same semantics — particularly:
 *
 *   - Wallet positions are positional (`currencies[0]` = money,
 *     `[1]` = dungeon tokens, `[2]` = quest points, `[3]` = diamonds,
 *     `[4]` = farm points). Untouched higher slots stay intact.
 *   - Multipliers at exactly 1.0 are **dropped** from
 *     `player._itemMultipliers` rather than written, so we never add
 *     spurious entries for shop items the user has never bought.
 *
 * All functions are pure on the input shape — easy to unit-test without
 * touching the DOM or the file picker.
 */
import type { SaveData } from './save'

// --- wallet -----------------------------------------------------------------

export type CurrencyKey = 'money' | 'tokens' | 'quest' | 'diamonds' | 'farm'

/** Positional indices into `save.wallet.currencies`. Stable across saves. */
export const CURRENCY_INDEX: Record<CurrencyKey, number> = {
  money: 0,
  tokens: 1,
  quest: 2,
  diamonds: 3,
  farm: 4,
}

export type Currencies = Record<CurrencyKey, number>

function getWallet(data: SaveData): number[] {
  const save = data.save as Record<string, unknown> | undefined
  const wallet = save?.wallet as Record<string, unknown> | undefined
  const arr = wallet?.currencies as unknown
  if (!Array.isArray(arr)) {
    throw new Error('save.wallet.currencies is missing or not an array')
  }
  return arr as number[]
}

export function readCurrencies(data: SaveData): Currencies {
  const arr = getWallet(data)
  return {
    money: arr[CURRENCY_INDEX.money] ?? 0,
    tokens: arr[CURRENCY_INDEX.tokens] ?? 0,
    quest: arr[CURRENCY_INDEX.quest] ?? 0,
    diamonds: arr[CURRENCY_INDEX.diamonds] ?? 0,
    farm: arr[CURRENCY_INDEX.farm] ?? 0,
  }
}

/**
 * Mutate `data` to apply the edited currency values. Negative or
 * non-integer inputs throw — saves with bogus values tend to break the
 * game in subtle ways and we'd rather refuse than write garbage.
 */
export function writeCurrencies(data: SaveData, edits: Currencies): void {
  const arr = getWallet(data)
  for (const [k, idx] of Object.entries(CURRENCY_INDEX) as [CurrencyKey, number][]) {
    const v = edits[k]
    if (!Number.isInteger(v) || v < 0) {
      throw new RangeError(`${k}: expected non-negative integer, got ${v}`)
    }
    arr[idx] = v
  }
}

// --- multipliers ------------------------------------------------------------

export type MultiplierKey =
  | 'Protein|money'
  | 'Calcium|money'
  | 'Carbos|money'
  | 'Masterball|farmPoint'

export type MultiplierSpec = {
  key: MultiplierKey
  label: string
  kind: 'vitamin' | 'ball'
}

/** Rows the tab exposes. Order matches the desktop editor for muscle memory. */
export const MULTIPLIERS: readonly MultiplierSpec[] = [
  { key: 'Protein|money', label: 'Protein price multiplier', kind: 'vitamin' },
  { key: 'Calcium|money', label: 'Calcium price multiplier', kind: 'vitamin' },
  { key: 'Carbos|money', label: 'Carbos price multiplier', kind: 'vitamin' },
  {
    key: 'Masterball|farmPoint',
    label: 'Master Ball price multiplier',
    kind: 'ball',
  },
]

export type Multipliers = Record<MultiplierKey, number>

function getOrCreateMultiplierBag(data: SaveData): Record<string, number> {
  const player = (data.player ?? {}) as Record<string, unknown>
  let bag = player._itemMultipliers as Record<string, number> | undefined
  if (bag === undefined) {
    bag = {}
    player._itemMultipliers = bag
    data.player = player
  }
  return bag
}

/** Default-to-1.0 read across the canonical multiplier rows. */
export function readMultipliers(data: SaveData): Multipliers {
  const player = (data.player ?? {}) as Record<string, unknown>
  const bag = (player._itemMultipliers as Record<string, number>) ?? {}
  const out = {} as Multipliers
  for (const { key } of MULTIPLIERS) out[key] = bag[key] ?? 1.0
  return out
}

/**
 * Mutate `data` to apply the edited multiplier values, dropping keys whose
 * value is exactly 1.0 (the game treats absent and 1.0 identically, and
 * not writing a 1.0 entry keeps fresh saves clean — matches the desktop
 * editor's behaviour since v0.5.1).
 */
export function writeMultipliers(data: SaveData, edits: Multipliers): void {
  const bag = getOrCreateMultiplierBag(data)
  for (const { key } of MULTIPLIERS) {
    const v = edits[key]
    if (!Number.isFinite(v) || v < 0) {
      throw new RangeError(`${key}: expected non-negative number, got ${v}`)
    }
    if (v === 1.0) {
      delete bag[key]
    } else {
      bag[key] = v
    }
  }
}
