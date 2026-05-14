/**
 * Read/write helpers for the Eggs tab — port of pcedit_gui.EggsTab.
 *
 * Save shape (under `save.breeding`):
 *
 *   eggSlots: int                    -- how many slots the game shows
 *   eggList:  Egg[]                  -- one entry per slot; trailing
 *                                       entries with type=-1 are empty
 *
 *   Egg shape: { type, pokemon, steps, totalSteps, shinyChance, notified }
 *
 * The desktop tab's constants (EGG_TYPES, QUICK_ADD presets, EMPTY_EGG
 * template, DEFAULT_NEW_EGG template) live here so both runtimes stay
 * pinned to the same defaults. Mutations are pure functions on the input
 * shape so they're easy to unit-test without the DOM.
 */
import type { SaveData } from './save'

// --- constants --------------------------------------------------------------

/** Maps the integer `egg.type` to a friendly label. Same set as the
 *  desktop editor's EGG_TYPES. */
export const EGG_TYPE_LABELS: Record<number, string> = {
  [-1]: 'Empty',
  0: 'Pokémon',
  1: 'Fire',
  2: 'Water',
  3: 'Grass',
  4: 'Fighting',
  5: 'Electric',
  6: 'Dragon',
  7: 'Mystery',
  8: 'Fossil',
}

/** Shape a fresh "empty slot" egg the game treats as not-yet-real. */
export const EMPTY_EGG: Egg = {
  totalSteps: 0,
  steps: 0,
  shinyChance: 1024,
  pokemon: 0,
  type: -1,
  notified: false,
}

/** Shape used by "Add egg" before the user customises it. Represents a
 *  generic Pokémon-type egg with the standard 1200-step hatch time. */
export const DEFAULT_NEW_EGG: Egg = {
  totalSteps: 1200,
  steps: 0,
  shinyChance: 1024,
  pokemon: 1,
  type: 0,
  notified: false,
}

export type QuickAddPreset = {
  /** Label shown on the `+ <label>` button. */
  label: string
  /** Egg fields to apply (steps reset to 0, notified false). */
  template: { type: number; pokemon: number; totalSteps: number }
}

/** Five quick-add buttons. `pokemon` is a representative species; the game
 *  picks the actual pokémon when the egg opens — but real eggList entries
 *  always have a non-zero pokemon field, so we seed it. totalSteps matches
 *  what shop-bought type eggs use in v0.10.x. */
export const QUICK_ADD_PRESETS: readonly QuickAddPreset[] = [
  { label: 'Grass',   template: { type: 3, pokemon: 1,   totalSteps: 9000 } },
  { label: 'Fire',    template: { type: 1, pokemon: 4,   totalSteps: 9000 } },
  { label: 'Water',   template: { type: 2, pokemon: 7,   totalSteps: 9000 } },
  { label: 'Dragon',  template: { type: 6, pokemon: 147, totalSteps: 9000 } },
  { label: 'Mystery', template: { type: 7, pokemon: 132, totalSteps: 9000 } },
]

// --- types ------------------------------------------------------------------

export type Egg = {
  type: number
  pokemon: number
  steps: number
  totalSteps: number
  shinyChance: number
  notified: boolean
}

// --- raw accessors ----------------------------------------------------------

function getBreeding(data: SaveData): Record<string, unknown> {
  const save = data.save as Record<string, unknown> | undefined
  const breeding = save?.breeding as Record<string, unknown> | undefined
  if (!breeding) throw new Error('save.breeding is missing')
  return breeding
}

export function readEggSlots(data: SaveData): number {
  const b = getBreeding(data)
  const n = b.eggSlots
  return typeof n === 'number' ? n : 1
}

export function writeEggSlots(data: SaveData, slots: number): void {
  if (!Number.isInteger(slots) || slots < 0) {
    throw new RangeError(`eggSlots: expected non-negative integer, got ${slots}`)
  }
  getBreeding(data).eggSlots = slots
}

export function readEggs(data: SaveData): Egg[] {
  const list = getBreeding(data).eggList
  if (!Array.isArray(list)) return []
  return list as Egg[]
}

// --- mutators ---------------------------------------------------------------
// These mutate the egg(s) in place inside data — call store.markDirty() in
// the component layer after invoking them.

export function setEgg(data: SaveData, index: number, egg: Egg): void {
  const eggs = readEggs(data)
  if (index < 0 || index >= eggs.length) {
    throw new RangeError(`egg index ${index} out of range (len ${eggs.length})`)
  }
  eggs[index] = egg
}

/** "Hatch now" — sets steps to totalSteps so the game finishes the egg on
 *  the next tick. */
export function hatchEgg(data: SaveData, index: number): void {
  const eggs = readEggs(data)
  const egg = eggs[index]
  if (!egg) throw new RangeError(`no egg at index ${index}`)
  egg.steps = egg.totalSteps
}

/** Replace a slot with the empty-egg template. Keeps the slot count intact. */
export function clearEgg(data: SaveData, index: number): void {
  setEgg(data, index, { ...EMPTY_EGG })
}

export function removeEgg(data: SaveData, index: number): void {
  const eggs = readEggs(data)
  if (index < 0 || index >= eggs.length) {
    throw new RangeError(`egg index ${index} out of range (len ${eggs.length})`)
  }
  eggs.splice(index, 1)
}

/** Append a fresh DEFAULT_NEW_EGG to the list. */
export function addEgg(data: SaveData): number {
  const eggs = readEggs(data)
  eggs.push({ ...DEFAULT_NEW_EGG })
  return eggs.length - 1
}

/**
 * Drop a quick-add preset into the first empty slot, or append if all slots
 * are full. Bumps `eggSlots` if the resulting list outgrows the configured
 * slot count. Returns the slot index that received the new egg.
 */
export function quickAddEgg(data: SaveData, preset: QuickAddPreset): number {
  const eggs = readEggs(data)
  const fresh: Egg = {
    totalSteps: preset.template.totalSteps,
    steps: 0,
    shinyChance: 1024,
    pokemon: preset.template.pokemon,
    type: preset.template.type,
    notified: false,
  }
  let target = eggs.findIndex((e) => e?.type === -1)
  if (target < 0) {
    eggs.push(fresh)
    target = eggs.length - 1
  } else {
    eggs[target] = fresh
  }
  const slots = readEggSlots(data)
  if (slots < eggs.length) writeEggSlots(data, eggs.length)
  return target
}

// --- formatting helper for the tab UI --------------------------------------

export function eggTypeLabel(type: number): string {
  return EGG_TYPE_LABELS[type] ?? '?'
}
