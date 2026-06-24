/**
 * Read/write helpers for the Currencies & Multipliers tab.
 *
 * Mirrors `pcedit_gui.CurrenciesTab` and matches PokeClicker's
 * `enum Currency` in `src/modules/GameConstants.ts`:
 *
 *   0 money, 1 questPoint, 2 dungeonToken, 3 diamond, 4 farmPoint,
 *   5 battlePoint, 6 contestToken.
 *
 * (PCEdit had `tokens` and `quest` slugs pointing at the wrong indices
 * before v0.9.0 — see the Fixed entry in CHANGELOG. The slug names
 * stayed the same so CLI invocations like `pcedit tokens` keep working,
 * but they now write the right slot.)
 *
 * Multipliers at exactly 1.0 are **dropped** from `player._itemMultipliers`
 * rather than written, so we never add spurious entries for shop items
 * the user has never bought.
 */
import type { SaveData } from './save'

// --- wallet -----------------------------------------------------------------

export type CurrencyKey =
  | 'money'
  | 'quest'
  | 'tokens'
  | 'diamonds'
  | 'farm'
  | 'battle'
  | 'contest'

/** Positional indices into `save.wallet.currencies`. Stable across saves. */
export const CURRENCY_INDEX: Record<CurrencyKey, number> = {
  money:    0,
  quest:    1,
  tokens:   2,
  diamonds: 3,
  farm:     4,
  battle:   5,
  contest:  6,
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
    money:    arr[CURRENCY_INDEX.money] ?? 0,
    quest:    arr[CURRENCY_INDEX.quest] ?? 0,
    tokens:   arr[CURRENCY_INDEX.tokens] ?? 0,
    diamonds: arr[CURRENCY_INDEX.diamonds] ?? 0,
    farm:     arr[CURRENCY_INDEX.farm] ?? 0,
    battle:   arr[CURRENCY_INDEX.battle] ?? 0,
    contest:  arr[CURRENCY_INDEX.contest] ?? 0,
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
    while (arr.length <= idx) arr.push(0)   // pad short wallets up to contest (6)
    arr[idx] = v
  }
}

// --- multipliers ------------------------------------------------------------

/** A single editable price-multiplier row from `player._itemMultipliers`. */
export type MultiplierRow = { key: string; label: string; value: number }

/**
 * Vitamin multipliers (bought with money) are always shown — even when absent
 * — so they can be set on a fresh save. Everything else is surfaced
 * dynamically from whatever the save actually contains. Items like Master Ball
 * have a SEPARATE multiplier per currency they're buyable with
 * (`Masterball|questPoint`, `|money`, `|dungeonToken`, …), so there is no
 * single hardcoded key for them — listing the live entries is the only
 * correct approach.
 */
export const VITAMIN_MULTIPLIER_KEYS: readonly string[] = [
  'Protein|money',
  'Calcium|money',
  'Carbos|money',
]

/** "Masterball" → "Master Ball"; otherwise split PascalCase into words. */
function prettyItem(item: string): string {
  const special: Record<string, string> = { Masterball: 'Master Ball' }
  return special[item] ?? item.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/** Human label for an `Item|currency` multiplier key. */
export function multiplierLabel(key: string): string {
  const [item, currency] = key.split('|')
  const base = `${prettyItem(item)} price multiplier`
  return currency ? `${base} (${currency})` : base
}

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

/**
 * All multiplier rows to show: the always-shown vitamins first (at their
 * stored value or 1.0), then every other entry actually present in
 * `player._itemMultipliers`, sorted for a stable order.
 */
export function readMultipliers(data: SaveData): MultiplierRow[] {
  const player = (data.player ?? {}) as Record<string, unknown>
  const bag = (player._itemMultipliers as Record<string, number>) ?? {}
  const rows: MultiplierRow[] = []
  const seen = new Set<string>()
  for (const key of VITAMIN_MULTIPLIER_KEYS) {
    rows.push({ key, label: multiplierLabel(key), value: bag[key] ?? 1.0 })
    seen.add(key)
  }
  for (const key of Object.keys(bag).sort()) {
    if (seen.has(key)) continue
    rows.push({ key, label: multiplierLabel(key), value: bag[key] })
    seen.add(key)
  }
  return rows
}

/**
 * Set a single multiplier. A value of exactly 1.0 deletes the key (the game
 * treats absent and 1.0 identically; not writing 1.0 keeps fresh saves clean).
 */
export function setMultiplier(data: SaveData, key: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${key}: expected non-negative number, got ${value}`)
  }
  const bag = getOrCreateMultiplierBag(data)
  if (value === 1.0) delete bag[key]
  else bag[key] = value
}
