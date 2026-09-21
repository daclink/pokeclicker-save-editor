# Web Inventory tab — design

Date: 2026-09-21 · Status: approved in chat · Web-only (desktop is sunset)

## Goal

Edit three `player._itemList` item families that have no editor today:
**egg items**, **evolution items**, and **mega stones** (the user's explicit
ask). Pulled ahead of the Quests tab at the user's request.

## Rosters (generated, not hand-typed)

`scripts/fetch_pokeclicker_data.py` parses PokeClicker `develop`:

| File | Source | Size | Shape |
|------|--------|------|-------|
| `data/egg-items.json` | `EggItemType` enum, `src/modules/GameConstants.ts` | 7 | `["Fire_egg", …, "Mystery_egg"]` |
| `data/evolution-items.json` | `StoneType` enum (minus `'None' = -1`) | 51 | `["Leaf_stone", …]` |
| `data/mega-stones.json` | `MegaStoneType` enum + `new MegaStoneItem(MegaStoneType.X, 'Base', …)` in `src/modules/items/ItemList.ts` | 50 | `[{"stone": "Alakazite", "base": "Alakazam"}, …]` |

`StoneType`/`EggItemType` members are quoted (`'Leaf_stone',`); the shared
enum parser is extended to accept quoted identifiers. Hard asserts: eggs
== 7, evolution items ≥ 50, every mega stone has exactly one base.

Out of scope: underground loot that also lives in `_itemList` (`*_plate`,
`Oval_stone`, `Odd_keystone`, `Hard_stone`, …) — not in these enums.

## Save semantics (from `src/scripts/Player.ts`)

- Load: every known item starts at 0, saved keys overlay it, unknown keys
  are ignored.
- Save: zero-count keys are deleted. Real saves contain no zero entries.
- `hasMegaStone` is `count > 0`; `gainMegaStone` sets the count to 1 and
  does nothing else (no party-pokémon field).

Therefore: missing key reads as 0; writing 0 **deletes** the key (same
discipline as `shards.ts`); counts must be non-negative integers; a mega
stone is a boolean — owned writes exactly `1`, not-owned deletes. Keys
outside the three rosters are never touched.

## Web

- `web/src/lib/inventory.ts` — pure read/write helpers:
  `readItemCounts(data, keys)`, `setItemCount(data, key, n)`,
  `setItemCounts(data, keys, n)`, `readMegaStones(data)`,
  `setMegaStone(data, stone, owned)`, `setMegaStones(data, stones, owned)`.
- `web/src/lib/data.ts` — `EGG_ITEMS`, `EVOLUTION_ITEMS`, `MEGA_STONES`,
  `itemDisplayName(key)` (`Kings_rock` → `Kings rock`), import-time
  invariants.
- `web/src/tabs/InventoryTab.svelte` — three `Card`s:
  1. **Egg items** (named to stay distinct from the breeding-queue Eggs tab)
     — count grid.
  2. **Evolution items** — count grid + "Set all to…".
  3. **Mega stones** — table: owned checkbox, stone, base pokémon, base
     caught ✓/—; "Give all", "Give for caught pokémon only", "Remove all".
     Not gated on the base being caught (the game doesn't gate it either).
- Wiring: `sections.ts` (`'inventory'`), `App.svelte`, sidebar.
- Design tokens only; listed in `MIGRATED_COMPONENTS` of the
  `design-tokens` guard test.

## Testing

- Python `tests/test_fetch_items.py`: quoted/unquoted enum parsing, `None`
  sentinel dropped, mega→base join, missing-base and count asserts.
- Web `tests/inventory.spec.ts`: missing → 0; write 0 deletes; negative /
  float / NaN rejected; mega set is exactly `1`, unset deletes, idempotent;
  unrelated keys (`Lucky_egg`, `xAttack`, shards) untouched.
- `tests/data.spec.ts`: roster shapes. `sections.spec.ts`: nine sections.
- Manual: real v0.10.25 save in the browser, both themes.
