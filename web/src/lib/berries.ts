/**
 * Read/write helpers for the Berries tab — port of pcedit_gui.BerriesTab.
 *
 * Touches `save.farming` for:
 *
 *   berryList:        70-entry int[]  — per-berry inventory count
 *   unlockedBerries:  70-entry bool[] — per-berry unlocked flag
 *   mulchList:        7-entry int[]   — per-mulch-slot inventory
 *   shovelAmt:        int             — regular shovels
 *   mulchShovelAmt:   int             — mulch shovels
 *
 * Out of scope for now: `plotList`, `mutations`, `farmHands` — live
 * mid-game state where careless edits can corrupt a save. Same line the
 * desktop tab draws.
 *
 * Lists shorter than the canonical roster get padded to length 70 (or
 * `mulchList.length`-or-7) on every write, matching the desktop tab's
 * defensive padding. The game accepts longer lists.
 */
import { BERRY_NAMES } from './data'
import type { SaveData } from './save'

const BERRY_COUNT = BERRY_NAMES.length // 70 in v0.10.25
const DEFAULT_MULCH_SLOTS = 7

// --- accessors --------------------------------------------------------------

function getFarming(data: SaveData): Record<string, unknown> {
  const save = data.save as Record<string, unknown> | undefined
  let farming = save?.farming as Record<string, unknown> | undefined
  if (!farming) {
    farming = {}
    if (save) save.farming = farming
  }
  return farming
}

function getBerryList(data: SaveData): number[] {
  const farming = getFarming(data)
  let arr = farming.berryList as number[] | undefined
  if (!Array.isArray(arr)) {
    arr = []
    farming.berryList = arr
  }
  return arr
}

function getUnlocked(data: SaveData): boolean[] {
  const farming = getFarming(data)
  let arr = farming.unlockedBerries as boolean[] | undefined
  if (!Array.isArray(arr)) {
    arr = []
    farming.unlockedBerries = arr
  }
  return arr
}

function getMulchList(data: SaveData): number[] {
  const farming = getFarming(data)
  let arr = farming.mulchList as number[] | undefined
  if (!Array.isArray(arr)) {
    arr = []
    farming.mulchList = arr
  }
  return arr
}

function padBerryArrays(data: SaveData): { counts: number[]; unlocked: boolean[] } {
  const counts = getBerryList(data)
  const unlocked = getUnlocked(data)
  while (counts.length < BERRY_COUNT) counts.push(0)
  while (unlocked.length < BERRY_COUNT) unlocked.push(false)
  return { counts, unlocked }
}

// --- public reads -----------------------------------------------------------

export type BerryRow = {
  idx: number
  name: string
  count: number
  unlocked: boolean
}

/** One row per BerryType entry. Missing list slots show as `0` / `false`. */
export function readBerryRows(data: SaveData): BerryRow[] {
  const counts = getBerryList(data)
  const unlocked = getUnlocked(data)
  return BERRY_NAMES.map((name, idx) => ({
    idx,
    name,
    count: counts[idx] ?? 0,
    unlocked: Boolean(unlocked[idx]),
  }))
}

/** Read mulch counts. Returns at least 7 entries (the v0.10.25 wild count);
 *  missing slots default to 0. */
export function readMulch(data: SaveData): number[] {
  const arr = getMulchList(data)
  const out: number[] = []
  const len = Math.max(arr.length, DEFAULT_MULCH_SLOTS)
  for (let i = 0; i < len; i++) out.push(arr[i] ?? 0)
  return out
}

export function readShovels(data: SaveData): {
  shovel: number
  mulchShovel: number
} {
  const farming = getFarming(data)
  return {
    shovel: (farming.shovelAmt as number) ?? 0,
    mulchShovel: (farming.mulchShovelAmt as number) ?? 0,
  }
}

// --- public writes ----------------------------------------------------------

function ensureNonNegInt(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 0) {
    throw new RangeError(`${name}: expected non-negative integer, got ${v}`)
  }
}

/** Write a single berry's count. Pads lists if shorter than 70. */
export function setBerryCount(data: SaveData, idx: number, n: number): void {
  if (idx < 0 || idx >= BERRY_COUNT) {
    throw new RangeError(`berry idx ${idx} out of range [0, ${BERRY_COUNT})`)
  }
  ensureNonNegInt(`berry[${idx}]`, n)
  const { counts } = padBerryArrays(data)
  counts[idx] = n
}

/** Toggle a single berry's unlocked flag. Writes a real bool. */
export function setBerryUnlocked(data: SaveData, idx: number, on: boolean): void {
  if (idx < 0 || idx >= BERRY_COUNT) {
    throw new RangeError(`berry idx ${idx} out of range [0, ${BERRY_COUNT})`)
  }
  const { unlocked } = padBerryArrays(data)
  unlocked[idx] = Boolean(on)
}

/** Apply the same count to many berries at once (Edit count… on selection). */
export function setBerryCounts(data: SaveData, indices: number[], n: number): void {
  ensureNonNegInt('berry count', n)
  const { counts } = padBerryArrays(data)
  for (const idx of indices) {
    if (idx < 0 || idx >= BERRY_COUNT) {
      throw new RangeError(`berry idx ${idx} out of range [0, ${BERRY_COUNT})`)
    }
    counts[idx] = n
  }
}

/** Apply the same unlocked flag to many berries (Unlock/Lock selected). */
export function setBerryUnlockedMany(
  data: SaveData,
  indices: number[],
  on: boolean,
): void {
  const { unlocked } = padBerryArrays(data)
  for (const idx of indices) {
    if (idx < 0 || idx >= BERRY_COUNT) {
      throw new RangeError(`berry idx ${idx} out of range [0, ${BERRY_COUNT})`)
    }
    unlocked[idx] = Boolean(on)
  }
}

/** Bulk: fill every berry's count with `n`. */
export function fillAllBerryCounts(data: SaveData, n: number): void {
  ensureNonNegInt('berry count', n)
  const { counts } = padBerryArrays(data)
  for (let i = 0; i < BERRY_COUNT; i++) counts[i] = n
}

/** Bulk: set every berry's unlocked flag. */
export function setAllBerriesUnlocked(data: SaveData, on: boolean): void {
  const { unlocked } = padBerryArrays(data)
  for (let i = 0; i < BERRY_COUNT; i++) unlocked[i] = Boolean(on)
}

/** Write a single mulch-slot count. Pads `mulchList` if shorter. */
export function setMulchCount(data: SaveData, idx: number, n: number): void {
  if (idx < 0) throw new RangeError(`mulch idx ${idx} must be >= 0`)
  ensureNonNegInt(`mulch[${idx}]`, n)
  const arr = getMulchList(data)
  while (arr.length <= idx) arr.push(0)
  arr[idx] = n
}

export function setShovels(
  data: SaveData,
  shovel: number,
  mulchShovel: number,
): void {
  ensureNonNegInt('shovelAmt', shovel)
  ensureNonNegInt('mulchShovelAmt', mulchShovel)
  const farming = getFarming(data)
  farming.shovelAmt = shovel
  farming.mulchShovelAmt = mulchShovel
}
