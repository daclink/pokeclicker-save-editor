# Web Quests Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a web-only "Quests" tab that lists both PokéClicker quest
systems (`save.quests.questList` board quests, `save.quests.questLines`
story lines), flags the exact stale-`initial`/negative-progress bug
diagnosed and hand-fixed this session (`"-962/10 Purple Shards"` on
`Zero's Ambition`), and offers a guarded one-click repair for flagged rows.

**Architecture:** A Python metadata generator extends the existing
`scripts/fetch_pokeclicker_data.py` fetch-and-commit pattern to scrape
`QuestLineHelper.ts` for `CustomQuest` step → `player.itemList` key
mappings, emitting `data/quest-steps.json`. A new `web/src/lib/quests.ts`
module reads both save arrays, computing `progress = liveValue - initial`
only for the quest types whose live value maps to a readable save path
(4 board-quest types via `save.statistics`, `CustomQuest` line-steps via
`player.itemList`) and returning `progress: null` ("can't verify") for
everything else. A new `web/src/tabs/QuestsTab.svelte` renders two tables
and wires into the existing sidebar/router (`sections.ts`, `App.svelte`).

**Tech Stack:** Python 3 (stdlib only, no new deps) for the metadata
generator; TypeScript + Svelte 5 (runes) + Vitest for the web tab, matching
the existing `web/` stack.

## Global Constraints

- Repo root: `/Users/drew/Downloads/pokeclicker-editor`. Web app: `web/`
  (run `npm --prefix web test` for Vitest, `npm --prefix web run check` for
  svelte-check/tsc). Python tests: `python3 -m unittest discover tests -v`
  from repo root.
- Spec of record: `docs/superpowers/specs/2026-07-28-quests-tab-design.md`
  (as corrected in commit `d3cf444`). Do not re-litigate its locked
  decisions.
- Web-only. Do not add a `pcedit_gui.py` Quests tab or a `pcedit.py quests`
  CLI command — explicitly out of scope.
- Never fabricate a progress number or offer repair for a quest type this
  plan doesn't explicitly mark resolvable. Unresolvable rows show `null`
  progress / "can't verify" and no repair button, full stop.
- Follow existing file conventions exactly: `web/src/lib/*.ts` read/write
  helper modules mirror `gems.ts`/`shards.ts`/`currencies.ts` (JSDoc header
  explaining the save shape, plain functions taking `SaveData`, no classes).
  `web/tests/*.spec.ts` mirror `gems.spec.ts` (Vitest, `describe`/`test`,
  inline fixtures preferred over the shared minimal fixture when the shared
  fixture doesn't carry the needed data — it doesn't here, `save.quests` in
  `tests/fixtures/v0.10.25/minimal.txt` has empty `questList`/`questLines`).
- **CSS note for Task 3:** the sidebar/shell already runs on the Phase 1
  design-token system (`web/src/app.css`: `--surface`, `--surface-2`,
  `--border`, `--text`, `--text-muted`, `--brand`, `--danger`, `--success`,
  `--space-1`…`--space-6`, `--radius-sm`/`--radius`/`--radius-lg`). Older
  tabs (`GemsTab.svelte`, `ShardsTab.svelte`, etc.) still use hardcoded hex
  from before that system landed and are slated for a Phase 2 migration
  that may or may not have happened by the time this task executes — check
  `git log --oneline -- web/src/tabs/GemsTab.svelte` before starting Task 3.
  Either way, **write `QuestsTab.svelte` using the CSS custom properties
  directly** (they already exist regardless of Phase 2's status) — do not
  copy any tab's current hardcoded-hex `<style>` block. This plan's Task 3
  step 3 gives the token-based CSS to use.

---

## Task 1: Quest-line step metadata generator

**Files:**
- Modify: `scripts/fetch_pokeclicker_data.py`
- Create: `tests/test_quest_steps_parser.py`
- Create (generated, committed): `data/quest-steps.json`

**Interfaces:**
- Produces: `parse_quest_line_steps(src: str) -> dict[str, list[dict]]` (pure
  function, importable from `fetch_pokeclicker_data`). Each dict value is a
  list of step-metadata dicts in the questline's `addQuest` order. A step is
  either `{"type": "<ClassName>"}` or, for a resolvable `CustomQuest`,
  `{"type": "CustomQuest", "itemKey": "<Key>", "amount": <int>}`.
- Produces: `data/quest-steps.json` — the committed output of
  `parse_quest_line_steps` run against the live `QuestLineHelper.ts`, keyed
  by exact questline display name (matches `save.quests.questLines[i].name`
  verbatim). Task 2 imports this file directly.

- [ ] **Step 1: Write the failing test for the pure parser**

Create `tests/test_quest_steps_parser.py`:

```python
"""Unit tests for the QuestLineHelper.ts step parser in
scripts/fetch_pokeclicker_data.py — pure regex/text parsing, no network.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from fetch_pokeclicker_data import parse_quest_line_steps  # noqa: E402

# A hand-written excerpt in the same shape as the real QuestLineHelper.ts —
# two questlines, interleaved local const names (mirrors real variable-name
# reuse across the file's many methods), one CustomQuest with an escaped
# apostrophe in its questline name (matches the real "Zero's Ambition").
FIXTURE_SRC = r"""
function buildFirstLine() {
    const line1 = new QuestLine('Zero\'s Ambition', 'desc', undefined, 0);
    const step1 = new TalkToNPCQuest(SomeNpc, 'Talk to someone.');
    line1.addQuest(step1);
    const step2 = new CustomQuest(10, 0, 'Obtain 10 Purple Shards.', () => player.itemList.Purple_shard());
    line1.addQuest(step2);
    const step1b = new DefeatDungeonQuest(1, 0, 'Some Dungeon');
    line1.addQuest(step1b);
    App.game.quests.questLines().push(line1);
}

function buildSecondLine() {
    const line2 = new QuestLine('Tutorial Quests', 'desc2');
    const step1 = new TalkToNPCQuest(OtherNpc, 'Talk to someone else.');
    line2.addQuest(step1);
    App.game.quests.questLines().push(line2);
}
"""


class ParseQuestLineStepsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.steps = parse_quest_line_steps(FIXTURE_SRC)

    def test_finds_both_questlines(self) -> None:
        self.assertEqual(set(self.steps.keys()), {"Zero's Ambition", "Tutorial Quests"})

    def test_unescapes_apostrophe_in_name(self) -> None:
        self.assertIn("Zero's Ambition", self.steps)

    def test_step_order_and_types(self) -> None:
        za = self.steps["Zero's Ambition"]
        self.assertEqual(len(za), 3)
        self.assertEqual(za[0], {"type": "TalkToNPCQuest"})
        self.assertEqual(
            za[1],
            {"type": "CustomQuest", "itemKey": "Purple_shard", "amount": 10},
        )
        self.assertEqual(za[2], {"type": "DefeatDungeonQuest"})

    def test_reused_local_var_name_across_questlines(self) -> None:
        # Both questlines declare a local `step1` — the parser must not let
        # the second definition bleed into the first questline's list.
        tut = self.steps["Tutorial Quests"]
        self.assertEqual(tut, [{"type": "TalkToNPCQuest"}])

    def test_custom_quest_without_itemlist_focus_has_no_itemkey(self) -> None:
        src = (
            "const line3 = new QuestLine('Odd Line', 'd');\n"
            "const step1 = new CustomQuest(1, 0, 'desc', "
            "() => player.oakItems.someCount());\n"
            "line3.addQuest(step1);\n"
        )
        steps = parse_quest_line_steps(src)
        self.assertEqual(steps["Odd Line"], [{"type": "CustomQuest"}])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m unittest tests.test_quest_steps_parser -v`
Expected: `ImportError: cannot import name 'parse_quest_line_steps'` (the
function doesn't exist yet).

- [ ] **Step 3: Implement `parse_quest_line_steps`**

Add to `scripts/fetch_pokeclicker_data.py`, in the "quest-lines parser"
section placed after the existing `_parse_enum_idents` helper (around where
`fetch_berry_names` is defined — same file region as the other TS-source
parsers):

```python
# --- quest-line step parser --------------------------------------------

QUEST_LINE_HELPER_URL = f"{PC_RAW}/src/scripts/quests/QuestLineHelper.ts"

# Single forward pass over the source. Three alternatives, tried in order
# at each position: a `const x = new QuestLine('Name', ...)` declaration, a
# `const x = new SomeQuestType(...)` step declaration, or an
# `x.addQuest(y)` call. Because addQuest calls always name their questline
# variable explicitly, a flat var->meta dict built strictly in file order
# is enough to resolve steps correctly even when different methods in the
# file reuse the same local variable names (e.g. `step1`) — each
# `addQuest` call reads whatever `step1` currently means at that point in
# the linear scan, matching real JS scoping since methods aren't
# interleaved in the source.
_QUEST_TOKEN_RE = re.compile(
    r"(?:const|let)\s+(?P<qlvar>\w+)\s*=\s*new QuestLine\(\s*'(?P<qlname>(?:\\'|[^'])*)'"
    r"|(?:const|let)\s+(?P<stepvar>\w+)\s*=\s*new (?P<stepclass>\w+)\("
    r"|(?P<addvar>\w+)\.addQuest\((?P<addarg>\w+)\)"
)

# Matched starting right after "new CustomQuest(" — captures the 4
# constructor args when the focus reads a player.itemList key (the only
# CustomQuest shape this tool can verify progress for).
_CUSTOM_QUEST_ITEMLIST_RE = re.compile(
    r"\s*(?P<amount>\d+)\s*,\s*-?\d+\s*,\s*'(?:\\'|[^'])*'"
    r"\s*,\s*\(\)\s*=>\s*player\.itemList\.(?P<itemkey>\w+)\(\)\s*\)"
)

EXPECTED_MIN_QUEST_LINES = 30
SANITY_QUEST_LINE = "Zero's Ambition"
SANITY_STEP_INDEX = 4
SANITY_STEP = {"type": "CustomQuest", "itemKey": "Purple_shard", "amount": 10}


def parse_quest_line_steps(src: str) -> dict[str, list[dict]]:
    """Parse `QuestLineHelper.ts` source into {questline name: [step, ...]}.

    Each step is `{"type": ClassName}`, or for a `CustomQuest` whose focus
    reads `player.itemList.<Key>()`, `{"type": "CustomQuest", "itemKey":
    <Key>, "amount": <int>}`. Steps we can't resolve a save path for
    (everything else) only ever get the bare `{"type": ...}` — callers must
    treat missing `itemKey` as "can't verify", never guess.
    """
    ql_var_to_name: dict[str, str] = {}
    ql_steps: dict[str, list[dict]] = {}
    step_var_to_meta: dict[str, dict] = {}

    for m in _QUEST_TOKEN_RE.finditer(src):
        if m.group("qlvar"):
            name = m.group("qlname").replace("\\'", "'")
            ql_var_to_name[m.group("qlvar")] = name
            ql_steps.setdefault(name, [])
        elif m.group("stepvar"):
            cls = m.group("stepclass")
            if cls == "CustomQuest":
                am = _CUSTOM_QUEST_ITEMLIST_RE.match(src, m.end())
                if am:
                    step_var_to_meta[m.group("stepvar")] = {
                        "type": "CustomQuest",
                        "itemKey": am.group("itemkey"),
                        "amount": int(am.group("amount")),
                    }
                else:
                    step_var_to_meta[m.group("stepvar")] = {"type": "CustomQuest"}
            else:
                step_var_to_meta[m.group("stepvar")] = {"type": cls}
        else:  # addQuest call
            qlname = ql_var_to_name.get(m.group("addvar"))
            meta = step_var_to_meta.get(m.group("addarg"))
            if qlname is not None and meta is not None:
                ql_steps[qlname].append(meta)

    return ql_steps


def fetch_quest_line_steps(*, retries: int = 3) -> dict[str, list[dict]]:
    """Pull QuestLineHelper.ts from the PokeClicker repo and parse it.

    Hard-asserts the exact shape of the bug diagnosed in this repo's
    2026-07-28 session (Zero's Ambition step 4 = Purple Shards) as the
    cheapest defense against an upstream restructure silently breaking the
    parser.
    """
    src = _fetch_with_retry(QUEST_LINE_HELPER_URL, label="QuestLineHelper.ts",
                            retries=retries)
    steps = parse_quest_line_steps(src)

    if len(steps) < EXPECTED_MIN_QUEST_LINES:
        raise SystemExit(
            f"expected at least {EXPECTED_MIN_QUEST_LINES} quest lines from "
            f"QuestLineHelper.ts, got {len(steps)}"
        )
    if SANITY_QUEST_LINE not in steps:
        raise SystemExit(f"quest line {SANITY_QUEST_LINE!r} not found — parser regressed")
    actual = steps[SANITY_QUEST_LINE][SANITY_STEP_INDEX]
    if actual != SANITY_STEP:
        raise SystemExit(
            f"{SANITY_QUEST_LINE!r} step {SANITY_STEP_INDEX} changed shape: "
            f"expected {SANITY_STEP!r}, got {actual!r}"
        )
    return steps
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python3 -m unittest tests.test_quest_steps_parser -v`
Expected: `OK` (5 tests pass).

- [ ] **Step 5: Wire the fetch into `write_data_files`/`main()`**

Modify `write_data_files` (append a `quest_steps` parameter and a
`_dump("quest-steps.json", quest_steps)` call) and `main()` (call
`fetch_quest_line_steps()` and pass its result through):

```python
def write_data_files(names: list[str], buckets: list[int],
                     berries: list[str], mulches: list[str],
                     types: list[list[int]],
                     quest_steps: dict[str, list[dict]]) -> list[Path]:
    """Write the reference-data JSON files the editors read.

    Layout mirrors the Python constants 1:1 so each file diffs cleanly when
    upstream changes.
    """
    digit_str = "".join(str(b) for b in buckets)
    written = [
        _dump("region-ranges.json",
              [[lbl, lo, hi] for lbl, lo, hi in REGION_RANGES]),
        _dump("pokemon-names.json", names),
        _dump("gender-buckets.json",
              {"labels": list(BUCKET_LABELS), "index": digit_str}),
        _dump("berry-names.json", berries),
        _dump("mulch-names.json", mulches),
        _dump("pokemon-types.json", types),
        _dump("quest-steps.json", quest_steps),
    ]
    return written
```

In `main()`, after the existing `types = fetch_pokemon_types()` line, add:

```python
    quest_steps = fetch_quest_line_steps()
    print(f"  {len(quest_steps)} quest lines parsed")
```

and update the `write_data_files(names, buckets, berries, mulches, types)`
call to `write_data_files(names, buckets, berries, mulches, types,
quest_steps)`.

- [ ] **Step 6: Run the full fetch script and inspect the output**

Run: `python3 scripts/fetch_pokeclicker_data.py`

This re-fetches everything (PokeAPI species data is cached under
`.cache/pokeapi/`, so only the TS-source fetches hit the network fresh).
Expected: script exits 0, prints `NNN quest lines parsed` (NNN ≥ 30), and
`data/quest-steps.json` now exists.

Verify the sanity case directly:

```bash
python3 -c "
import json
d = json.load(open('data/quest-steps.json'))
print(d[\"Zero's Ambition\"][4])
"
```
Expected: `{'type': 'CustomQuest', 'itemKey': 'Purple_shard', 'amount': 10}`

- [ ] **Step 7: Commit**

```bash
git add scripts/fetch_pokeclicker_data.py tests/test_quest_steps_parser.py data/quest-steps.json
git commit -m "feat: generate data/quest-steps.json from QuestLineHelper.ts

Extends the existing fetch-and-commit pattern (BerryType.ts,
PokemonList.ts) to scrape CustomQuest step -> player.itemList key
mappings per quest line. Feeds the web Quests tab's stale-initial
detection (web/src/lib/quests.ts, next task)."
```

---

## Task 2: `web/src/lib/quests.ts` — read/flag/repair helpers

**Files:**
- Create: `web/src/lib/quests.ts`
- Create: `web/tests/quests.spec.ts`

**Interfaces:**
- Consumes: `SaveData` type and `decodeBytes` from `../src/lib/save` (test
  only); `data/quest-steps.json` (produced by Task 1) as the default
  quest-line step metadata source.
- Produces (consumed by Task 3):
  - `type BoardQuestRow = { index: number; name: string; claimed: boolean; amount: number | null; progress: number | null; flagged: boolean }`
  - `type QuestLineRow = { name: string; state: 'inactive' | 'started' | 'ended' | 'suspended'; step: number; stepType: string | null; amount: number | null; progress: number | null; flagged: boolean }`
  - `readBoardQuests(data: SaveData): BoardQuestRow[]`
  - `readQuestLines(data: SaveData, steps?: QuestStepsData): QuestLineRow[]`
  - `repairBoardQuest(data: SaveData, index: number): void`
  - `repairQuestLine(data: SaveData, name: string, steps?: QuestStepsData): void`
  - `type QuestStepsData = Record<string, QuestStepMeta[]>` and
    `type QuestStepMeta = { type: string; itemKey?: string; amount?: number }`

- [ ] **Step 1: Write the failing tests**

Create `web/tests/quests.spec.ts`:

```typescript
/**
 * Pure-function tests for the quests helpers. Mirrors gems.spec.ts /
 * shards.spec.ts, but builds inline SaveData fixtures rather than using
 * the shared minimal fixture — tests/fixtures/v0.10.25/minimal.txt has
 * empty save.quests.{questList,questLines}.
 */
import { describe, expect, test } from 'vitest'

import type { SaveData } from '../src/lib/save'
import {
  readBoardQuests,
  readQuestLines,
  repairBoardQuest,
  repairQuestLine,
  type QuestStepsData,
} from '../src/lib/quests'
// Static import, matching the pattern already used in src/lib/data.ts —
// avoids relying on dynamic-JSON-import behavior in the test runner.
import realQuestStepsJson from '../../data/quest-steps.json'

function baseSave(overrides: {
  questList?: unknown[]
  questLines?: unknown[]
  statistics?: Record<string, unknown>
  itemList?: Record<string, unknown>
}): SaveData {
  return {
    player: { _itemList: overrides.itemList ?? {} },
    save: {
      statistics: overrides.statistics ?? {},
      quests: {
        questList: overrides.questList ?? [],
        questLines: overrides.questLines ?? [],
      },
    },
  } as unknown as SaveData
}

describe('readBoardQuests', () => {
  test('GainMoneyQuest: verifiable, positive progress, not flagged', () => {
    const data = baseSave({
      questList: [
        { name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: false, index: 0 },
      ],
      statistics: { totalMoney: 900 },
    })
    const rows = readBoardQuests(data)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ index: 0, name: 'GainMoneyQuest', amount: 1000, progress: 400, flagged: false })
  })

  test('GainTokensQuest reads statistics.totalDungeonTokens', () => {
    const data = baseSave({
      questList: [{ name: 'GainTokensQuest', data: [100, 10], initial: 50, claimed: false, index: 0 }],
      statistics: { totalDungeonTokens: 80 },
    })
    expect(readBoardQuests(data)[0].progress).toBe(30)
  })

  test('GainFarmPointsQuest reads statistics.totalFarmPoints', () => {
    const data = baseSave({
      questList: [{ name: 'GainFarmPointsQuest', data: [200, 20], initial: 100, claimed: false, index: 0 }],
      statistics: { totalFarmPoints: 260 },
    })
    expect(readBoardQuests(data)[0].progress).toBe(160)
  })

  test('GainGemsQuest reads statistics.gemsGained at the type index in data[2]', () => {
    const data = baseSave({
      questList: [{ name: 'GainGemsQuest', data: [430, 821, 10], initial: 519763, claimed: false, index: 0 }],
      statistics: { gemsGained: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 519900, 0, 0, 0, 0, 0, 0, 0] },
    })
    expect(readBoardQuests(data)[0].progress).toBe(137)
  })

  test('flags negative progress (regressed statistic)', () => {
    const data = baseSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: false, index: 0 }],
      statistics: { totalMoney: 100 },
    })
    const row = readBoardQuests(data)[0]
    expect(row.progress).toBe(-400)
    expect(row.flagged).toBe(true)
  })

  test('unresolvable quest type: progress null, not flagged', () => {
    const data = baseSave({
      questList: [{ name: 'HatchEggsQuest', data: [20, 5], initial: 3, claimed: false, index: 0 }],
    })
    const row = readBoardQuests(data)[0]
    expect(row.progress).toBeNull()
    expect(row.flagged).toBe(false)
  })

  test('missing save.quests.questList reads as empty', () => {
    const data = { player: {}, save: {} } as unknown as SaveData
    expect(readBoardQuests(data)).toEqual([])
  })
})

describe('repairBoardQuest', () => {
  test('resets initial to the live statistic on a flagged row', () => {
    const data = baseSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: false, index: 0 }],
      statistics: { totalMoney: 100 },
    })
    repairBoardQuest(data, 0)
    const entry = (data.save as any).quests.questList[0]
    expect(entry.initial).toBe(100)
    expect(readBoardQuests(data)[0].progress).toBe(0)
  })

  test('no-ops on a non-flagged row', () => {
    const data = baseSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 50], initial: 500, claimed: false, index: 0 }],
      statistics: { totalMoney: 900 },
    })
    repairBoardQuest(data, 0)
    expect((data.save as any).quests.questList[0].initial).toBe(500)
  })

  test('no-ops on an out-of-range index', () => {
    const data = baseSave({ questList: [] })
    expect(() => repairBoardQuest(data, 0)).not.toThrow()
  })
})

const TEST_STEPS: QuestStepsData = {
  "Zero's Ambition": [
    { type: 'TalkToNPCQuest' },
    { type: 'TalkToNPCQuest' },
    { type: 'TalkToNPCQuest' },
    { type: 'TalkToNPCQuest' },
    { type: 'CustomQuest', itemKey: 'Purple_shard', amount: 10 },
  ],
  'Tutorial Quests': [{ type: 'TalkToNPCQuest' }],
}

describe('readQuestLines', () => {
  test('CustomQuest step: verifiable progress against player._itemList', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: "Zero's Ambition", quest: 4, initial: 10479 }],
      itemList: { Purple_shard: 9517 },
    })
    const rows = readQuestLines(data, TEST_STEPS)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "Zero's Ambition",
      state: 'started',
      step: 4,
      stepType: 'CustomQuest',
      amount: 10,
      progress: -962,
      flagged: true,
    })
  })

  test('decodes all four QuestLineState values', () => {
    const data = baseSave({
      questLines: [
        { state: 0, name: 'A', quest: 0, initial: null },
        { state: 1, name: 'Tutorial Quests', quest: 0, initial: false },
        { state: 2, name: 'C', quest: 0, initial: null },
        { state: 3, name: 'D', quest: 0, initial: null },
      ],
    })
    const rows = readQuestLines(data, TEST_STEPS)
    expect(rows.map((r) => r.state)).toEqual(['inactive', 'started', 'ended', 'suspended'])
  })

  test('non-CustomQuest step type: progress null, no crash', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: 'Tutorial Quests', quest: 0, initial: false }],
    })
    const row = readQuestLines(data, TEST_STEPS)[0]
    expect(row.stepType).toBe('TalkToNPCQuest')
    expect(row.progress).toBeNull()
    expect(row.flagged).toBe(false)
  })

  test('MultipleQuestsQuest-shaped array initial: progress null, no crash', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: "Zero's Ambition", quest: 4, initial: [true, 3] }],
      itemList: { Purple_shard: 9517 },
    })
    const row = readQuestLines(data, TEST_STEPS)[0]
    expect(row.progress).toBeNull()
    expect(row.flagged).toBe(false)
  })

  test('questline name absent from step metadata: progress null, no crash', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: 'Some Future Line', quest: 0, initial: 5 }],
    })
    const row = readQuestLines(data, TEST_STEPS)[0]
    expect(row.stepType).toBeNull()
    expect(row.progress).toBeNull()
  })
})

describe('repairQuestLine', () => {
  test("fixes the exact Zero's Ambition / Purple Shards regression case", () => {
    const data = baseSave({
      questLines: [{ state: 1, name: "Zero's Ambition", quest: 4, initial: 10479 }],
      itemList: { Purple_shard: 9517 },
    })
    repairQuestLine(data, "Zero's Ambition", TEST_STEPS)
    const entry = (data.save as any).quests.questLines[0]
    expect(entry.initial).toBe(9517)
    expect(readQuestLines(data, TEST_STEPS)[0].progress).toBe(0)
    expect(readQuestLines(data, TEST_STEPS)[0].flagged).toBe(false)
  })

  test('no-ops on a non-flagged line', () => {
    const data = baseSave({
      questLines: [{ state: 1, name: "Zero's Ambition", quest: 4, initial: 9000 }],
      itemList: { Purple_shard: 9517 },
    })
    repairQuestLine(data, "Zero's Ambition", TEST_STEPS)
    expect((data.save as any).quests.questLines[0].initial).toBe(9000)
  })

  test('no-ops when the name is not found', () => {
    const data = baseSave({ questLines: [] })
    expect(() => repairQuestLine(data, 'Nonexistent', TEST_STEPS)).not.toThrow()
  })
})

describe('real generated data/quest-steps.json', () => {
  test("Zero's Ambition step 4 matches the diagnosed bug shape", () => {
    const real = realQuestStepsJson as unknown as QuestStepsData
    expect(real["Zero's Ambition"][4]).toEqual({
      type: 'CustomQuest',
      itemKey: 'Purple_shard',
      amount: 10,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- quests.spec.ts`
Expected: FAIL — `Cannot find module '../src/lib/quests'` (module doesn't
exist yet).

- [ ] **Step 3: Implement `web/src/lib/quests.ts`**

```typescript
/**
 * Read/flag/repair helpers for the Quests tab.
 *
 * PokeClicker has two independent quest systems under `save.quests`:
 *
 *   - `questList`  — 10 rotating "board" quests, always one of a fixed
 *     roster of quest *types*. Each entry:
 *     `{name, data: [amount, reward, ...extra], initial, claimed, notified}`.
 *   - `questLines` — fixed story quest lines. Each entry:
 *     `{state, name, quest: <active step index>, initial}`, where `state`
 *     is PokeClicker's `QuestLineState` enum (0 inactive / 1 started /
 *     2 ended / 3 suspended) and `initial` reflects whatever the
 *     *currently active* step snapshotted when it began.
 *
 * Both systems compute live progress the same way (PokeClicker's
 * `Quest.ts`): `progress = focus() - initial()`, with **no floor at
 * zero**. If a save edit lowers the tracked value after a quest snapshots
 * `initial`, progress goes negative and gets stuck forever — that's the
 * exact bug this module flags (diagnosed 2026-07-28: "Zero's Ambition" /
 * Purple Shards went to -962/10 after a save edit).
 *
 * Only quest types whose live focus maps to a save path we can read are
 * "resolvable" — flagged and repairable. Everything else reports
 * `progress: null` ("can't verify") rather than guessing:
 *
 *   - Board: `GainMoneyQuest`/`GainTokensQuest`/`GainFarmPointsQuest`/
 *     `GainGemsQuest` read a **lifetime** `save.statistics` counter
 *     (verified against PokeClicker source — NOT the spendable
 *     wallet/gemWallet balance `currencies.ts`/`gems.ts` model, a
 *     different field). These only ever increase under normal play, so a
 *     negative reading here is an unambiguous tamper signal.
 *   - Quest lines: only `CustomQuest` steps whose focus reads
 *     `player.itemList.<Key>` — resolved via the generated
 *     `data/quest-steps.json` (built by
 *     `scripts/fetch_pokeclicker_data.py` from PokeClicker's
 *     `QuestLineHelper.ts`).
 *
 * Repair (on flagged rows only) resets `initial` to the current live
 * value — this exactly replicates PokeClicker's own live-decrease
 * compensation in `Quest.ts`'s focus subscriber, which only fires during
 * an active browser session and never for an out-of-band save edit.
 */
import type { SaveData } from './save'
import questStepsJson from '../../../data/quest-steps.json'

// --- types -------------------------------------------------------------

export type QuestLineState = 'inactive' | 'started' | 'ended' | 'suspended'

export type QuestStepMeta = {
  type: string
  itemKey?: string
  amount?: number
}

export type QuestStepsData = Record<string, QuestStepMeta[]>

export type BoardQuestRow = {
  index: number
  name: string
  claimed: boolean
  amount: number | null
  progress: number | null
  flagged: boolean
}

export type QuestLineRow = {
  name: string
  state: QuestLineState
  step: number
  stepType: string | null
  amount: number | null
  progress: number | null
  flagged: boolean
}

const QUEST_STEPS = questStepsJson as QuestStepsData

const QUEST_LINE_STATES: readonly QuestLineState[] = [
  'inactive',
  'started',
  'ended',
  'suspended',
]

// --- board quests --------------------------------------------------------

type QuestListEntry = {
  claimed?: boolean
  data?: unknown[]
  initial?: unknown
  name?: string
}

/** Board-quest types whose live focus is this simple `save.statistics`
 *  scalar field. `GainGemsQuest` is handled separately below (positional
 *  array, not a scalar). */
const SIMPLE_STAT_FIELD: Record<string, string> = {
  GainMoneyQuest: 'totalMoney',
  GainTokensQuest: 'totalDungeonTokens',
  GainFarmPointsQuest: 'totalFarmPoints',
}

function getStatistics(data: SaveData): Record<string, unknown> {
  const save = (data.save ?? {}) as Record<string, unknown>
  return (save.statistics ?? {}) as Record<string, unknown>
}

function getQuestList(data: SaveData): QuestListEntry[] {
  const save = (data.save ?? {}) as Record<string, unknown>
  const quests = (save.quests ?? {}) as Record<string, unknown>
  const list = quests.questList
  return Array.isArray(list) ? (list as QuestListEntry[]) : []
}

/** Live focus value for a board-quest entry, or `null` if this quest type
 *  isn't resolvable (or its expected save fields are missing/malformed). */
function liveBoardFocus(data: SaveData, entry: QuestListEntry): number | null {
  const stats = getStatistics(data)
  const field = SIMPLE_STAT_FIELD[entry.name ?? '']
  if (field) {
    const v = stats[field]
    return typeof v === 'number' ? v : null
  }
  if (entry.name === 'GainGemsQuest') {
    const typeIndex = entry.data?.[2]
    const gained = stats.gemsGained
    if (typeof typeIndex === 'number' && Array.isArray(gained)) {
      const v = gained[typeIndex]
      return typeof v === 'number' ? v : null
    }
  }
  return null
}

export function readBoardQuests(data: SaveData): BoardQuestRow[] {
  return getQuestList(data).map((entry, i) => {
    const focus = liveBoardFocus(data, entry)
    const canVerify = focus !== null && typeof entry.initial === 'number'
    const progress = canVerify ? (focus as number) - (entry.initial as number) : null
    const amount = typeof entry.data?.[0] === 'number' ? (entry.data[0] as number) : null
    return {
      index: i,
      name: entry.name ?? '',
      claimed: entry.claimed ?? false,
      amount: canVerify ? amount : null,
      progress,
      flagged: progress !== null && progress < 0,
    }
  })
}

/** Resets `initial` to the live focus value. Only mutates when the row is
 *  actually flagged (recomputed here, not trusted from the caller) — an
 *  out-of-range index or an unflagged row is a silent no-op. */
export function repairBoardQuest(data: SaveData, index: number): void {
  const list = getQuestList(data)
  const entry = list[index]
  if (!entry) return
  const focus = liveBoardFocus(data, entry)
  if (focus === null || typeof entry.initial !== 'number') return
  if (focus - entry.initial >= 0) return
  entry.initial = focus
}

// --- quest lines -----------------------------------------------------------

type QuestLineEntry = {
  state?: number
  name?: string
  quest?: number
  initial?: unknown
}

function getItemList(data: SaveData): Record<string, unknown> {
  const player = (data.player ?? {}) as Record<string, unknown>
  return (player._itemList ?? {}) as Record<string, unknown>
}

function getQuestLines(data: SaveData): QuestLineEntry[] {
  const save = (data.save ?? {}) as Record<string, unknown>
  const quests = (save.quests ?? {}) as Record<string, unknown>
  const lines = quests.questLines
  return Array.isArray(lines) ? (lines as QuestLineEntry[]) : []
}

function stateLabel(n: number | undefined): QuestLineState {
  return QUEST_LINE_STATES[n ?? 0] ?? 'inactive'
}

function stepMetaFor(steps: QuestStepsData, name: string, stepIndex: number): QuestStepMeta | null {
  return steps[name]?.[stepIndex] ?? null
}

/** Live focus + target amount for a quest-line step, or `null` if the step
 *  isn't a resolvable CustomQuest (no metadata, wrong type, or a
 *  CustomQuest whose focus isn't a player.itemList read). */
function liveLineFocus(
  data: SaveData,
  meta: QuestStepMeta | null,
): { focus: number; amount: number } | null {
  if (!meta || meta.type !== 'CustomQuest' || meta.itemKey === undefined || meta.amount === undefined) {
    return null
  }
  const v = getItemList(data)[meta.itemKey]
  return { focus: typeof v === 'number' ? v : 0, amount: meta.amount }
}

export function readQuestLines(data: SaveData, steps: QuestStepsData = QUEST_STEPS): QuestLineRow[] {
  return getQuestLines(data).map((entry) => {
    const meta = stepMetaFor(steps, entry.name ?? '', entry.quest ?? 0)
    const live = liveLineFocus(data, meta)
    const canVerify = live !== null && typeof entry.initial === 'number'
    const progress = canVerify ? live!.focus - (entry.initial as number) : null
    return {
      name: entry.name ?? '',
      state: stateLabel(entry.state),
      step: entry.quest ?? 0,
      stepType: meta?.type ?? null,
      amount: canVerify ? live!.amount : null,
      progress,
      flagged: progress !== null && progress < 0,
    }
  })
}

/** Resets `initial` to the live focus value. Recomputes flagged-ness
 *  itself rather than trusting the caller; a name that isn't found, isn't
 *  resolvable, or isn't actually flagged is a silent no-op. */
export function repairQuestLine(
  data: SaveData,
  name: string,
  steps: QuestStepsData = QUEST_STEPS,
): void {
  const lines = getQuestLines(data)
  const entry = lines.find((e) => e.name === name)
  if (!entry) return
  const meta = stepMetaFor(steps, entry.name ?? '', entry.quest ?? 0)
  const live = liveLineFocus(data, meta)
  if (live === null || typeof entry.initial !== 'number') return
  if (live.focus - entry.initial >= 0) return
  entry.initial = live.focus
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- quests.spec.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Type-check**

Run: `npm --prefix web run check`
Expected: no new errors from `quests.ts` or `quests.spec.ts`.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/quests.ts web/tests/quests.spec.ts
git commit -m "feat(web): quests.ts — read/flag/repair for both quest systems

Board quests (GainMoney/Tokens/FarmPoints/GemsQuest) resolve against
save.statistics lifetime counters; quest-line CustomQuest steps
resolve against player._itemList via the generated
data/quest-steps.json. Everything else reports progress:null rather
than guessing. Includes a regression test reproducing today's
Zero's Ambition / Purple Shards bug exactly."
```

---

## Task 3: `QuestsTab.svelte` + sidebar wiring

**Files:**
- Create: `web/src/tabs/QuestsTab.svelte`
- Modify: `web/src/lib/sections.ts`
- Modify: `web/src/App.svelte`
- Modify: `web/tests/sections.spec.ts`
- Modify: `web/tests/shell.spec.ts`

**Interfaces:**
- Consumes: `readBoardQuests`, `readQuestLines`, `repairBoardQuest`,
  `repairQuestLine`, `BoardQuestRow`, `QuestLineRow` from `../lib/quests`
  (Task 2). `store` from `../lib/store.svelte` (existing, same pattern as
  every other tab — `store.data: SaveData | null`, `store.markDirty()`).
- Produces: nothing consumed by later tasks (this is the last task).

- [ ] **Step 1: Update the two wiring tests to expect the new section (red first)**

In `web/tests/sections.spec.ts`, change the id list and add the new
sub-test:

```typescript
import { describe, expect, test } from 'vitest'
import { SECTIONS } from '../src/lib/sections'

describe('SECTIONS', () => {
  test('lists the nine editor sections in order', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      'currencies',
      'eggs',
      'shards',
      'gems',
      'flutes',
      'berries',
      'caught',
      'pokedex',
      'quests',
    ])
  })

  test('every section has a non-empty label and icon', () => {
    for (const s of SECTIONS) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.icon.length).toBeGreaterThan(0)
    }
  })

  test('ids are unique', () => {
    const ids = SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

In `web/tests/shell.spec.ts`, add `'Quests'` to the rendered-label list:

```typescript
// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/svelte'
import App from '../src/App.svelte'

afterEach(cleanup)

describe('App shell', () => {
  test('renders a sidebar item for every section', () => {
    const { getByText } = render(App)
    for (const label of [
      'Currencies & Multipliers',
      'Eggs',
      'Shards',
      'Gems',
      'Flutes',
      'Berries',
      'Caught Pokémon',
      'Pokédex',
      'Quests',
    ]) {
      expect(getByText(label)).toBeTruthy()
    }
  })

  test('shows the empty state (privacy promise) when no save is loaded', () => {
    const { getByText } = render(App)
    expect(getByText(/your save never leaves this tab/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- sections.spec.ts shell.spec.ts`
Expected: FAIL — `sections.spec.ts` "lists the nine editor sections" gets 8
ids not 9; `shell.spec.ts` can't find text "Quests".

- [ ] **Step 3: Update `sections.ts`**

In `web/src/lib/sections.ts`, add `'quests'` to the `SectionId` union and a
new entry to `SECTIONS` (appended at the end — it doesn't fit either the
item-tabs group or the pokemon-tabs group cleanly):

```typescript
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
  | 'quests'

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
  { id: 'quests', label: 'Quests', icon: '📜' },
]
```

- [ ] **Step 4: Write `QuestsTab.svelte`**

Create `web/src/tabs/QuestsTab.svelte`:

```svelte
<script lang="ts">
  // Quests tab — read-only examiner for both quest systems (save.quests),
  // with a guarded one-click repair for the "stale initial" bug class: a
  // save edit that lowers a tracked value (e.g. a shard count) after a
  // quest snapshotted it produces permanently negative, stuck progress.
  // Repair mirrors what PokeClicker's own live-decrease compensation does
  // (see lib/quests.ts) and is only ever offered on rows this tool can
  // actually verify — everything else reads "can't verify", never a guess.

  import { store } from '../lib/store.svelte'
  import {
    readBoardQuests,
    readQuestLines,
    repairBoardQuest,
    repairQuestLine,
    type BoardQuestRow,
    type QuestLineRow,
  } from '../lib/quests'

  let tick = $state(0)
  let showAllLines = $state(false)

  let boardQuests = $derived.by(() => {
    void tick
    return store.data ? readBoardQuests(store.data) : []
  })

  let questLines = $derived.by(() => {
    void tick
    return store.data ? readQuestLines(store.data) : []
  })

  let visibleLines = $derived(
    showAllLines
      ? questLines
      : questLines.filter((q) => q.state === 'started' || q.state === 'suspended'),
  )

  function refreshAfter(fn: () => void): void {
    if (!store.data) return
    fn()
    store.markDirty()
    tick++
  }

  function repairBoard(row: BoardQuestRow): void {
    refreshAfter(() => repairBoardQuest(store.data!, row.index))
  }

  function repairLine(row: QuestLineRow): void {
    refreshAfter(() => repairQuestLine(store.data!, row.name))
  }

  function progressText(row: { progress: number | null; amount: number | null }): string {
    if (row.progress === null || row.amount === null) return "can't verify"
    return `${row.progress.toLocaleString('en-US')} / ${row.amount.toLocaleString('en-US')}`
  }
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to examine quests.</p>
{:else}
  <section class="block">
    <h3>Board Quests</h3>
    <p class="note">
      The 10 rotating quests in <code>save.quests.questList</code>. Progress
      shows for the quest types this tool can verify against a live save
      value; everything else reads <em>can't verify</em> rather than guess.
    </p>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Claimed</th>
          <th>Progress</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each boardQuests as row (row.index)}
          <tr class:flagged={row.flagged}>
            <td>{row.name}</td>
            <td>{row.claimed ? 'Yes' : 'No'}</td>
            <td>{progressText(row)}</td>
            <td>
              {#if row.flagged}
                <button type="button" onclick={() => repairBoard(row)}>Repair</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="block">
    <div class="line-header">
      <h3>Quest Lines</h3>
      <label class="toggle">
        <input type="checkbox" bind:checked={showAllLines} />
        Show inactive / ended lines
      </label>
    </div>
    <p class="note">
      The story quest lines in <code>save.quests.questLines</code>. Only the
      currently active step of each line can be checked — earlier and later
      steps aren't tracked by the save.
    </p>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>State</th>
          <th>Step</th>
          <th>Progress</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each visibleLines as row (row.name)}
          <tr class:flagged={row.flagged}>
            <td>{row.name}</td>
            <td>{row.state}</td>
            <td>{row.step + 1}{row.stepType ? ` (${row.stepType})` : ''}</td>
            <td>{progressText(row)}</td>
            <td>
              {#if row.flagged}
                <button type="button" onclick={() => repairLine(row)}>Repair</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .empty {
    color: var(--text-muted);
    padding: var(--space-4);
    background: var(--surface-2);
    border-radius: var(--radius);
  }
  .block {
    margin-bottom: var(--space-5);
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .block h3 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
    color: var(--text);
  }
  .line-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.85em;
    color: var(--text-muted);
  }
  .note {
    margin: 0 0 var(--space-3);
    color: var(--text-muted);
    font-size: 0.9em;
  }
  .note code {
    background: var(--surface-2);
    padding: 0 0.25rem;
    border-radius: 3px;
    font-size: 0.95em;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  th,
  td {
    text-align: left;
    padding: var(--space-2) var(--space-2);
    border-bottom: 1px solid var(--border);
    color: var(--text);
  }
  th {
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.85em;
  }
  tr.flagged td {
    color: var(--danger);
  }
  button {
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--brand);
    background: transparent;
    color: var(--brand);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font: inherit;
    font-size: 0.85em;
  }
  button:hover {
    background: var(--brand);
    color: var(--brand-contrast);
  }
</style>
```

- [ ] **Step 5: Wire into `App.svelte`**

In `web/src/App.svelte`, add the import and the conditional render branch:

```typescript
  import PokedexTab from './tabs/PokedexTab.svelte'
  import QuestsTab from './tabs/QuestsTab.svelte'
```

```svelte
    {:else if active === 'pokedex'}
      <PokedexTab />
    {:else if active === 'quests'}
      <QuestsTab />
    {/if}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm --prefix web test`
Expected: PASS — full suite green, including `sections.spec.ts` (9 ids) and
`shell.spec.ts` ("Quests" label found).

- [ ] **Step 7: Type-check**

Run: `npm --prefix web run check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add web/src/tabs/QuestsTab.svelte web/src/lib/sections.ts web/src/App.svelte web/tests/sections.spec.ts web/tests/shell.spec.ts
git commit -m "feat(web): Quests tab — board quests + quest lines examiner

Two tables (Board Quests, Quest Lines) with a Repair button on rows
flagged by lib/quests.ts's stale-initial detection. Wired into the
sidebar as the ninth section."
```

---

## Task 4: Manual validation against a real save

Not a coded test — this closes the loop against actual PokeClicker save
data, which is the only way to confirm the tab behaves correctly end to end
against real, messy production data rather than hand-built fixtures.

- [ ] **Step 1: Build and serve the web app locally**

Run: `npm --prefix web run dev`, open the printed local URL in a browser.

- [ ] **Step 2: Load a real save and inspect Board Quests**

Use **Browse…** to load one of the real exports in `../pokeclicker/*.txt`
(the repo's sibling save directory). Open the **Quests** tab. Cross-check
2–3 board-quest rows' `progress` values against `pcedit.py get`:

```bash
python3 pcedit.py get "../pokeclicker/<latest export>.txt" "save.quests.questList[0]"
python3 pcedit.py get "../pokeclicker/<latest export>.txt" "save.statistics.totalMoney"
```

Confirm the displayed progress equals `totalMoney - initial` (or the
equivalent field for whichever quest type is in slot 0).

- [ ] **Step 3: Reproduce and repair the diagnosed bug**

Load `[v0.10.25] PokeClicker 2026-07-28 21_48_55.txt` (the exact export
used to diagnose today's bug). Confirm the **Quest Lines** table shows
`Zero's Ambition` flagged with `progress: -962`. Click **Repair**. Confirm
it now reads `0 / 10` and is no longer flagged. Use **Save** to export the
fixed file, then run:

```bash
python3 pcedit.py get "<downloaded fixed file>.txt" "save.quests.questLines[name=Zero's Ambition].initial"
```

Expected: `9517` (matches the hand-fix already applied to the separate
`.FIXED-quest.txt` file earlier this session) or the current live
`Purple_shard` count if more time has passed.

- [ ] **Step 4: Confirm can't-verify rows never show a repair button**

In the same loaded save, find at least one board-quest row of an
unresolvable type (e.g. `DefeatDungeonQuest`, `HatchEggsQuest`) and at
least one quest-line row on a non-`CustomQuest` step (e.g. any
`TalkToNPCQuest` step). Confirm both show `can't verify` and have no
Repair button.

- [ ] **Step 5: Record the result**

No commit for this task (verification only). If any step surfaces a bug,
fix it in the relevant Task 1–3 file, add/adjust a test that would have
caught it, and re-run that task's test suite before continuing.
