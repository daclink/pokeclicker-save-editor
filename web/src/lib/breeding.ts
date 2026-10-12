/**
 * Read/write helpers for the Eggs tab — port of pcedit_gui.EggsTab.
 *
 * Save shape (under `save.breeding`):
 *
 *   eggSlots: int                    -- how many slots the game shows
 *                                       (at most MAX_EGG_SLOTS)
 *   eggList:  Egg[]                  -- one entry per slot; empty slots
 *                                       have type=-1 (EggType.None)
 *
 *   Egg shape: { type, pokemon, steps, totalSteps, shinyChance, notified }
 *
 * The species is fixed when an egg is created: `Egg.hatch()` hatches
 * `egg.pokemon` (src/scripts/breeding/Egg.ts), whatever the egg's type.
 *
 * Slot indexes matter: hatchery helpers are assigned per slot index
 * (`hatcheryHelpers.hired()[i]`, Breeding.ts), so nothing here ever
 * shifts an egg to another index — removing an egg empties its slot.
 *
 * Mutations are pure functions on the input shape so they're easy to
 * unit-test without the DOM.
 */
import { isKnownPokemonId, nameFor } from './data'
import type { SaveData } from './save'

// --- constants --------------------------------------------------------------

/** Mirror of the game's `enum EggType { None = -1, Pokemon, EggItem }`
 *  (src/modules/breeding/EggType.ts, v0.10.26). Bred eggs are `Pokemon`;
 *  shop / item eggs are `EggItem` with the species already chosen. */
export const EGG_TYPE = { None: -1, Pokemon: 0, EggItem: 1 } as const

/** Friendly label for each real `egg.type` value. Other numbers (2–8 were
 *  written by older editor versions) are shown via `eggTypeLabel`. */
export const EGG_TYPE_LABELS: Readonly<Record<number, string>> = {
  [EGG_TYPE.None]: 'Empty',
  [EGG_TYPE.Pokemon]: 'Pokémon',
  [EGG_TYPE.EggItem]: 'Egg item',
}

/** The game's egg slot cap: `Breeding.defaults.eggList` holds exactly 4
 *  eggs, `fromJSON` reads only those 4 indexes (a 5th saved egg is
 *  dropped) and `gainEggSlot` stops at `eggList.length`
 *  (src/scripts/breeding/Breeding.ts, v0.10.26). */
export const MAX_EGG_SLOTS = 4

/** Default `shinyChance` of a new egg: `GameConstants.SHINY_CHANCE_BREEDING`
 *  (src/modules/GameConstants.ts), the Egg constructor default. Lower =
 *  more likely shiny. */
export const SHINY_CHANCE_BREEDING = 1024

/** Hatch time for "Add egg" before the user customises it. */
export const DEFAULT_NEW_EGG_TOTAL_STEPS = 1200

/** Hatch time for quick-add eggs: what shop-bought eggs use in v0.10.x. */
export const QUICK_ADD_TOTAL_STEPS = 9000

/** Shape of a fresh "empty slot" egg the game treats as not-yet-real. */
export const EMPTY_EGG: Egg = {
  totalSteps: 0,
  steps: 0,
  shinyChance: SHINY_CHANCE_BREEDING,
  pokemon: 0,
  type: EGG_TYPE.None,
  notified: false,
}

/** Shape used by "Add egg" before the user customises it: a bred
 *  Bulbasaur egg with DEFAULT_NEW_EGG_TOTAL_STEPS to hatch. */
export const DEFAULT_NEW_EGG: Egg = {
  totalSteps: DEFAULT_NEW_EGG_TOTAL_STEPS,
  steps: 0,
  shinyChance: SHINY_CHANCE_BREEDING,
  pokemon: 1,
  type: EGG_TYPE.Pokemon,
  notified: false,
}

export type QuickAddPreset = {
  /** Label shown on the `+ <label>` button. */
  label: string
  /** Egg fields to apply (steps reset to 0, notified false). */
  template: { type: number; pokemon: number; totalSteps: number }
}

/** National dex ids of the quick-add species (Bulbasaur, Charmander,
 *  Squirtle, Dratini, Eevee). */
const QUICK_ADD_SPECIES: readonly number[] = [1, 4, 7, 147, 133]

/** Quick-add buttons. Each is a species egg of type EggItem — the same
 *  shape the game's shop / item eggs have (`createItemEgg` picks the
 *  species up front and the egg always hatches it). */
export const QUICK_ADD_PRESETS: readonly QuickAddPreset[] = QUICK_ADD_SPECIES.map((pokemon) => ({
  label: `${nameFor(pokemon)} egg`,
  template: { type: EGG_TYPE.EggItem, pokemon, totalSteps: QUICK_ADD_TOTAL_STEPS },
}))

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
  if (slots > MAX_EGG_SLOTS) {
    throw new RangeError(`eggSlots: the game has at most ${MAX_EGG_SLOTS} slots, got ${slots}`)
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

/** "Remove" an egg: same as clearEgg. The slot stays (as an empty egg) so
 *  other eggs keep their index and their hatchery helper. */
export function removeEgg(data: SaveData, index: number): void {
  clearEgg(data, index)
}

/**
 * Index of the slot a new egg should go into: the first empty slot within
 * the first MAX_EGG_SLOTS, else the next index if the list is shorter than
 * the cap, else `null` (all slots full). Never returns an index >= the cap.
 */
function freeSlotIndex(eggs: readonly Egg[]): number | null {
  const limit = Math.min(eggs.length, MAX_EGG_SLOTS)
  for (let i = 0; i < limit; i++) {
    if (eggs[i]?.type === EGG_TYPE.None) return i
  }
  return eggs.length < MAX_EGG_SLOTS ? eggs.length : null
}

/**
 * Put `egg` into the first free slot (see freeSlotIndex) and bump
 * `eggSlots` so the game shows that slot (never above the cap). Returns
 * the slot index, or `null` — with the save untouched — when all
 * MAX_EGG_SLOTS slots are full.
 */
function placeEgg(data: SaveData, egg: Egg): number | null {
  const eggs = readEggs(data)
  const target = freeSlotIndex(eggs)
  if (target === null) return null
  if (target === eggs.length) {
    // eggList may be missing or a non-array; readEggs returned a detached
    // [] in that case, so write the list back.
    eggs.push(egg)
    getBreeding(data).eggList = eggs
  } else {
    eggs[target] = egg
  }
  if (readEggSlots(data) < target + 1) writeEggSlots(data, target + 1)
  return target
}

/** Add a fresh DEFAULT_NEW_EGG. Returns its slot index, or `null` when all
 *  slots are full. */
export function addEgg(data: SaveData): number | null {
  return placeEgg(data, { ...DEFAULT_NEW_EGG })
}

/** Drop a quick-add preset into the first free slot. Returns its slot
 *  index, or `null` when all slots are full. */
export function quickAddEgg(data: SaveData, preset: QuickAddPreset): number | null {
  return placeEgg(data, {
    totalSteps: preset.template.totalSteps,
    steps: 0,
    shinyChance: SHINY_CHANCE_BREEDING,
    pokemon: preset.template.pokemon,
    type: preset.template.type,
    notified: false,
  })
}

/** Why `egg.pokemon` is not acceptable, or `null` when it is. An empty egg
 *  may hold 0; anything else needs an id the game knows (base species or
 *  form) — unknown ids would hatch MissingNo. */
export function eggPokemonError(egg: Egg): string | null {
  if (egg.type === EGG_TYPE.None && egg.pokemon === 0) return null
  if (isKnownPokemonId(egg.pokemon)) return null
  return `Unknown Pokémon id ${egg.pokemon}: use a national dex number or a form id like 306.01`
}

// --- formatting helper for the tab UI --------------------------------------

export function eggTypeLabel(type: number): string {
  return EGG_TYPE_LABELS[type] ?? `Unknown (#${type})`
}
