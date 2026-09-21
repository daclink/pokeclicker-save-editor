# Web Quests Tab — Board Quests & Quest Lines Examiner

**Date:** 2026-07-28
**Status:** Approved design (pending user review)
**Branch:** TBD (created at plan/implementation time)

## Context

Today's session diagnosed and hand-fixed a real save-corruption bug: PokéClicker
tracks progress on many quests as `liveValue - storedInitial`, with no floor at
zero. When a save is edited out-of-band (e.g. via the existing Shards tab) after
a quest has started tracking that value, the stored `initial` snapshot goes
stale and progress can go negative and get stuck forever — the reported symptom
was `"-962/10 Purple Shards"` on the `Zero's Ambition` quest line. The fix
applied by hand today reset the stale `initial` to the current live value,
which exactly mirrors what PokéClicker's own live-decrease compensation would
have done had the edit happened in a running session instead of via a save
import.

The user wants a tool to **examine quests** going forward: see the state of
both quest systems in the save, and catch/repair this class of bug without
another round of manual JSON surgery.

PokéClicker's save has two independent quest systems, both under `save.quests`:

- **`questList`** — 10 slots of rotating "board" quests. Always one of a fixed
  set of quest *types* (`GainMoneyQuest`, `GainGemsQuest`, `HatchEggsQuest`,
  `MineLayersQuest`, `DefeatDungeonQuest`, `GainTokensQuest`,
  `HarvestBerriesQuest`, `UseOakItemQuest`, `GainFarmPointsQuest`,
  `MineItemsQuest`). Each entry: `{name, data: [amount, reward, ...extra],
  initial, claimed, notified}`.
- **`questLines`** — 33 fixed story quest lines (e.g. `Zero's Ambition`,
  `Tutorial Quests`). Each entry: `{name, state, quest: <step index>,
  initial}`. `state` is `QuestLineState`: `0 inactive / 1 started / 2 ended /
  3 suspended`. `initial` reflects whatever the *currently active step's* Quest
  subclass snapshotted when that step began (a number, a bool, or — for
  `MultipleQuestsQuest` steps — an array of mixed booleans/numbers).

Both systems compute progress the same way (`Quest.ts`, PokéClicker source):
`progress = (focus() - initial()) / amount`, unclamped at the bottom.

This spec covers a **web-only** tab (matches the desktop-sunset decision — web
is the product now). Desktop and CLI are explicitly out of scope; if the CLI
angle proves worth it later, it's a small separate addition since `pcedit.py`
already has generic `get`/`set` path support that covers ad-hoc cases today.

**Sequencing:** this lands *after* the existing queue — cutting the v0.9.0
release, the desktop deprecation-notice PR, and the dark-mode font-contrast
fix (elevated priority, hits every user since dark is the default theme) all
come first.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Surface | Web tab only (`web/src/tabs/QuestsTab.svelte`), no CLI, no desktop |
| Layout | One "Quests" sidebar entry, two sections on the page: Board Quests, Quest Lines |
| Anomaly scope | Flag only **resolvable** quest types where live focus can be read from the save; flag only when `progress < 0` (a real regression, not "already over target") |
| Unresolvable quest types | Shown plainly (name/state/step/claimed) — **no flag, no badge, no repair button**. We don't claim to know something we can't verify. |
| Repair action | Included in v1. One-click button on flagged rows only: sets `initial = liveFocusValue`. Mirrors the engine's own live-decrease compensation (`Quest.ts`'s focus subscriber) — not a judgment call, a replication of existing game logic. |
| Metadata generation | Extend `scripts/fetch_pokeclicker_data.py` (same pattern as `data/pokemon-types.json`) to scrape `QuestLineHelper.ts` for `CustomQuest` step → `itemList` key mappings. Checked-in output: `data/quest-steps.json`. No hardcoded save-layout guesses. |

## Goals

1. Read-only visibility into both quest systems: every `questList` slot and
   every `questLines` entry, in one place.
2. Correctly flag the exact bug class hit today — stale `initial` producing
   negative progress — for the subset of quest types where that's verifiable,
   and only that subset.
3. A safe, one-click repair for flagged rows that exactly replicates what the
   game itself would have done on a live value decrease.
4. Never fabricate a diagnosis for quest types we can't read a live value for.

Non-goals: CLI/desktop surfaces, resurrecting the six board-quest types whose
focus is a statistics counter (out of scope for v1 — no flag/repair for
`HatchEggsQuest`, `MineLayersQuest`, `DefeatDungeonQuest`, `HarvestBerriesQuest`,
`UseOakItemQuest`, `MineItemsQuest`), `MultipleQuestsQuest` step handling
(array-valued `initial` — shown plainly, not flagged), editing quest
*content* (claiming, rewards, unlocking).

## Resolvable quest types

**Board quests (`questList`)** — 4 of the 10 types read a **lifetime
statistics counter** (verified against PokéClicker source, not the current
wallet/gem-wallet balance this repo already models in `currencies.ts`/
`gems.ts` — those track spendable balances, which is a different field).
These counters only ever increase under normal play, so a negative-progress
flag here is an even cleaner tamper signal than the quest-line case. No
fetch-script metadata needed, just a formula reading `save.statistics`
directly:

| Type | Live focus (PokéClicker source) | Formula |
|------|-----------|---------|
| `GainMoneyQuest` | `save.statistics.totalMoney` | `data[0]` is amount, `initial` vs. current `totalMoney` |
| `GainTokensQuest` | `save.statistics.totalDungeonTokens` | same shape |
| `GainFarmPointsQuest` | `save.statistics.totalFarmPoints` | same shape |
| `GainGemsQuest` | `save.statistics.gemsGained[data[2]]` (type index in `data`; positional array, PokemonType-indexed like `gemWallet` but a separate lifetime-total field) | same shape |

The other 6 board-quest types track statistics counters this repo doesn't
model (egg-hatch counts, mining layer/item counts, per-dungeon clear counts,
per-berry harvest counts, per-oak-item use counts) — **can't verify** in v1.

**Quest lines (`questLines`)** — only the currently-active step's Quest
subclass matters (per entry, there's exactly one active step at a time). Only
`CustomQuest` steps are resolvable, and only when their focus reads
`player.itemList.<Key>` (this covers today's bug and similarly-shaped steps —
e.g. `obtain10OchreShards`, `obtain10CrimsonShards` elsewhere in
`Zero's Ambition`, and other story lines' shard/plate/item-gate steps).
`TalkToNPCQuest`, `DefeatDungeonQuest`, `DefeatTemporaryBattleQuest`,
`CaptureSpecificPokemonQuest`, `MultipleQuestsQuest`, etc. are **can't verify**.

## Data flow

1. `scripts/fetch_pokeclicker_data.py` gains a step that fetches
   `src/scripts/quests/QuestLineHelper.ts` from the PokeClicker GitHub repo
   (same fetch style already used for `BerryType.ts`), and regex-parses every
   `new QuestLine(name, ...)` block for its ordered `addQuest(...)` calls,
   picking out `CustomQuest(amount, reward, description, () =>
   player.itemList.<Key>())` instances. Emits `data/quest-steps.json`:
   ```json
   {
     "Zero's Ambition": [
       { "type": "TalkToNPCQuest" },
       { "type": "TalkToNPCQuest" },
       { "type": "TalkToNPCQuest" },
       { "type": "TalkToNPCQuest" },
       { "type": "CustomQuest", "itemKey": "Purple_shard", "amount": 10 },
       { "type": "TalkToNPCQuest" },
       { "type": "CustomQuest", "itemKey": "Ochre_shard", "amount": 10 },
       ...
     ],
     ...
   }
   ```
   Non-`CustomQuest` steps only record `type` (used for display, not for
   resolving focus).
2. `web/src/lib/quests.ts` (new) exposes:
   - `readBoardQuests(data)` → `{name, state fields..., progress: number |
     null, flagged: boolean}[]` — `progress` is `null` for the 6 unresolvable
     types.
   - `readQuestLines(data)` → same shape, `progress` derived from
     `quest-steps.json` lookup by `(name, step index)` for `CustomQuest`
     steps, `null` for everything else including `MultipleQuestsQuest`.
   - `repairBoardQuest(data, index)` / `repairQuestLine(data, name)` — sets
     `initial` to the live focus value. Only callable on flagged rows (the UI
     enforces this; the functions themselves also refuse silently-wrong input
     by recomputing and no-op'ing if `progress >= 0` at call time).
3. `web/src/tabs/QuestsTab.svelte` (new) — two sections, one table each:
   - **Board Quests** (10 rows, always all shown — small fixed list).
   - **Quest Lines** (33 rows, default-filtered to `state ∈ {started,
     suspended}`; a toggle reveals `inactive`/`ended` ones too, since most of
     33 are irrelevant most of the time).
   - Row rendering: name, state/step, progress (`"N / amount"`, or `"—"` /
     "can't verify" styling when `progress === null`), a 🛠 repair button
     when `flagged`.
4. `sections.ts` gains a `quests` entry; sidebar icon TBD (e.g. `📜`).

## Testing

- `web/tests/quests.spec.ts` (new, mirrors `gems.spec.ts`/`shards.spec.ts`
  patterns): unit tests for `readBoardQuests`/`readQuestLines` formulas
  (money/tokens/farmPoints/gems board quests; `CustomQuest` line steps) and
  for `repairBoardQuest`/`repairQuestLine`.
- A fixture in `tests/make_fixtures.py` (Python side) isn't needed since this
  feature is web-only; the Svelte test file builds its own minimal
  `SaveData` fixtures inline, including one deliberately reproducing today's
  exact bug shape (`Purple_shard` count below `Zero's Ambition` step 4's
  stored `initial`) as a regression test for the exact case diagnosed today.
- Manual validation: load a real save (the `../pokeclicker/*.txt` exports),
  confirm the tab's board-quest and quest-line counts match `pcedit.py get`
  spot-checks, confirm the repair button on the reproduced bug case produces
  the same output as today's manual fix.

## Open questions for the plan stage

None — decisions above are locked. The implementation plan should sequence:
metadata script change → `quest-steps.json` generation and commit → `quests.ts`
+ tests → `QuestsTab.svelte` + `sections.ts` wiring → manual validation against
a real save.
