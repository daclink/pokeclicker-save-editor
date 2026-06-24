/** Single source of truth for the editor's sections (sidebar + router). */
export type SectionId =
  | 'currencies'
  | 'eggs'
  | 'shards'
  | 'gems'
  | 'flutes'
  | 'berries'
  | 'caught'
  | 'pokedex'

export type Section = {
  id: SectionId
  label: string
  /** Emoji glyph shown in the sidebar rail. */
  icon: string
}

export const SECTIONS: readonly Section[] = [
  { id: 'currencies', label: 'Currencies & Multipliers', icon: '💰' },
  { id: 'eggs', label: 'Eggs', icon: '🥚' },
  { id: 'shards', label: 'Shards', icon: '🔷' },
  { id: 'gems', label: 'Gems', icon: '💎' },
  { id: 'flutes', label: 'Flutes', icon: '🎵' },
  { id: 'berries', label: 'Berries', icon: '🫐' },
  { id: 'caught', label: 'Caught Pokémon', icon: '⛺' },
  { id: 'pokedex', label: 'Pokédex', icon: '📕' },
]
