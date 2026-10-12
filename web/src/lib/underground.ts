/**
 * Underground loot rosters for the Underground tab: treasures, plates,
 * fossils and special items — plain counts in `player._itemList`, written
 * through the Inventory helpers (`readItemCounts` / `setItemCount[s]`, so 0
 * deletes the key like the game does).
 *
 * The Underground also yields shards, evolution stones and mega stones;
 * those already have editors on other tabs, so they're mapped to that tab
 * here rather than listed twice (two editors for one key go stale against
 * each other). A new `UndergroundValueType` must be added to one of the two
 * tables — `underground.spec.ts` fails until it is.
 */
import { UNDERGROUND_ITEMS, type UndergroundValueType } from './data'

export type UndergroundCategory = {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly valueTypes: readonly UndergroundValueType[]
}

export const UNDERGROUND_CATEGORIES: readonly UndergroundCategory[] = [
  {
    id: 'treasures',
    label: 'Treasures',
    description: 'Diamond-value treasures (Rare Bone, Heart Scale, Everstone, …). Sold in the Underground for diamonds.',
    valueTypes: ['Diamond'],
  },
  {
    id: 'plates',
    label: 'Plates',
    description: 'Type plates. Sold in the Underground for gems of their type.',
    valueTypes: ['Gem'],
  },
  {
    id: 'fossils',
    label: 'Fossils',
    description: 'Fossils and Galar fossil pieces. Revived into pokémon from the Hatchery.',
    valueTypes: ['Fossil', 'FossilPiece'],
  },
  {
    id: 'special',
    label: 'Special',
    description: 'Palaeontologist Token — traded to the Palaeontologist for Palaeontologist Pikachu or diamonds.',
    valueTypes: ['Special'],
  },
]

/** Underground value types edited on another tab, with that tab's label. */
export const UNDERGROUND_EDITED_ELSEWHERE: Readonly<Partial<Record<UndergroundValueType, string>>> = {
  Shard: 'Shards',
  EvolutionItem: 'Inventory',
  MegaStone: 'Inventory',
}

/** `_itemList` keys in a category, in the game's order. */
export function undergroundKeys(category: UndergroundCategory): string[] {
  const types = new Set<UndergroundValueType>(category.valueTypes)
  return UNDERGROUND_ITEMS.filter((i) => types.has(i.valueType)).map((i) => i.key)
}
