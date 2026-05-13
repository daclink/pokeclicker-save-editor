/**
 * Static reference data for the editor — TypeScript counterpart to
 * `pokeclicker_data.py`.
 *
 * Reads the same `data/*.json` files the Python shim reads (one source of
 * truth for both runtimes). Vite inlines the JSON at build time, so there's
 * no runtime fetch; the cost is in the bundle (the names table is the
 * biggest at ~14 KB pretty-printed → ~8 KB minified, well worth it for the
 * zero-network UX).
 *
 * The asserts at the bottom mirror the import-time invariants in
 * `pokeclicker_data.py`. If `data/*.json` is regenerated and one of them
 * fails, the build dies loud rather than silently shipping a wrong roster.
 */

import berryNamesJson from '../../../data/berry-names.json'
import genderBucketsJson from '../../../data/gender-buckets.json'
import mulchNamesJson from '../../../data/mulch-names.json'
import pokemonNamesJson from '../../../data/pokemon-names.json'
import regionRangesJson from '../../../data/region-ranges.json'

// --- types -----------------------------------------------------------------

export type RegionRange = {
  readonly label: string
  readonly lo: number
  readonly hi: number
}

export type GenderBucket =
  | 'totalMalePokemonCaptured'
  | 'totalFemalePokemonCaptured'
  | 'totalGenderlessPokemonCaptured'

type GenderBucketsJson = { labels: readonly string[]; index: string }

// --- exported constants ----------------------------------------------------

export const NATIONAL_NAMES: readonly string[] = pokemonNamesJson as readonly string[]
export const BERRY_NAMES: readonly string[] = berryNamesJson as readonly string[]
export const MULCH_NAMES: readonly string[] = mulchNamesJson as readonly string[]

// TS sees JSON arrays as `(string | number)[]` rather than tuples, so we
// cast through `unknown` and trust the shape (the import-time invariants
// below catch genuine drift).
export const REGION_RANGES: readonly RegionRange[] = (
  regionRangesJson as unknown as readonly [string, number, number][]
).map(([label, lo, hi]) => ({ label, lo, hi }))

const _buckets = genderBucketsJson as GenderBucketsJson
const BUCKET_LABELS = _buckets.labels as readonly GenderBucket[]
const BUCKET_INDEX: string = _buckets.index

// Backward-compat alias for callers that still want Kanto only.
export const KANTO_NAMES: readonly string[] = NATIONAL_NAMES.slice(0, 151)

// --- import-time invariants (parallel to pokeclicker_data.py) --------------

if (NATIONAL_NAMES.length !== 1025) {
  throw new Error(
    `national roster is 1025 names, got ${NATIONAL_NAMES.length}`,
  )
}
if (BUCKET_INDEX.length !== NATIONAL_NAMES.length) {
  throw new Error(
    `_BUCKET_INDEX length (${BUCKET_INDEX.length}) must match ` +
      `NATIONAL_NAMES (${NATIONAL_NAMES.length})`,
  )
}
if (BERRY_NAMES.length !== 70) {
  throw new Error(`berry roster is 70 names, got ${BERRY_NAMES.length}`)
}
if (BERRY_NAMES[0] !== 'Cheri' || BERRY_NAMES[BERRY_NAMES.length - 1] !== 'Hopo') {
  throw new Error(
    `berry roster endpoints drifted: ${JSON.stringify(BERRY_NAMES[0])} ... ` +
      JSON.stringify(BERRY_NAMES[BERRY_NAMES.length - 1]),
  )
}
if (MULCH_NAMES.length < 6) {
  throw new Error(`mulch roster expected >=6 names, got ${MULCH_NAMES.length}`)
}

// --- helpers (parallel to name_for / region_for / stat_bucket_for / etc.) --

function coerceId(pid: unknown): number | null {
  if (typeof pid === 'number' && Number.isFinite(pid)) return Math.trunc(pid)
  if (typeof pid === 'string') {
    const n = Number(pid)
    return Number.isFinite(n) ? Math.trunc(n) : null
  }
  return null
}

/** Friendly name for a national-dex id (1-based), or `'?'` if unknown. */
export function nameFor(pid: unknown): string {
  const idx = coerceId(pid)
  if (idx !== null && idx >= 1 && idx <= NATIONAL_NAMES.length) {
    return NATIONAL_NAMES[idx - 1]
  }
  return '?'
}

/** Region label for a national-dex id, or `'?'` if out of range. */
export function regionFor(pid: unknown): string {
  const idx = coerceId(pid)
  if (idx === null) return '?'
  for (const { label, lo, hi } of REGION_RANGES) {
    if (idx >= lo && idx <= hi) return label
  }
  return '?'
}

/**
 * `save.statistics.<…>` counter key to bump for this species.
 * Returns `null` outside the table; callers should bump only the
 * gender-neutral total in that case.
 */
export function statBucketFor(pid: unknown): GenderBucket | null {
  const idx = coerceId(pid)
  if (idx === null || idx < 1 || idx > BUCKET_INDEX.length) return null
  const digit = BUCKET_INDEX.charCodeAt(idx - 1) - 48 // '0' = 48
  return BUCKET_LABELS[digit] ?? null
}

/** BerryType name for an index into `save.farming.berryList`, or `'?'`. */
export function nameForBerry(idx: unknown): string {
  const n = coerceId(idx)
  if (n !== null && n >= 0 && n < BERRY_NAMES.length) return BERRY_NAMES[n]
  return '?'
}

/**
 * MulchType display name for a `save.farming.mulchList` position. Falls back
 * to `'Slot N'` for indices beyond the enum (real saves observed in the wild
 * sometimes carry one extra slot).
 */
export function nameForMulch(idx: unknown): string {
  const n = coerceId(idx)
  if (n === null || n < 0) return '?'
  if (n < MULCH_NAMES.length) return MULCH_NAMES[n]
  return `Slot ${n}`
}
