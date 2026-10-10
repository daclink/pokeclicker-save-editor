"""Unit tests for the QuestLineHelper.ts step parser in
scripts/fetch_pokeclicker_data.py — pure regex/text parsing, no network.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from fetch_pokeclicker_data import (  # noqa: E402
    build_quest_steps_payload,
    check_step_count,
    parse_game_version,
    strip_comments,
    parse_quest_line_steps,
)

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


INLINE_SRC = r"""
const lineA = new QuestLine('Inline Line', 'd');
const first = new TalkToNPCQuest(Npc, 'hi');
lineA.addQuest(first);
lineA.addQuest(new DefeatDungeonQuest(1, 0, 'Dungeon'));
lineA.addQuest(new CustomQuest(5, 0, 'Get 5 Fire Stones.', () => player.itemList.Fire_stone()));
const last = new TalkToNPCQuest(Npc, 'bye');
lineA.addQuest(last);
"""

NESTED_SRC = r"""
const lineB = new QuestLine('Nested Line', 'd');
const nested1 = new CustomQuest(1, 0, 'x', () => player.itemList.Moon_stone());
const nested2 = new TalkToNPCQuest(Npc, 'y');
lineB.addQuest(new MultipleQuestsQuest(
    [
        nested1,
        nested2,
        new CustomQuest(2, 0, 'z', () => player.itemList.Leaf_stone()),
    ], 'Do all of these.'
));
lineB.addQuest(new TalkToNPCQuest(Npc, 'after'));
"""

CLOSURE_SRC = r"""
const lineC = new QuestLine('Closure Line', 'd');
const make = (type: PokemonType) => {
    const a = new CapturePokemonTypesQuest(100, 0, type);
    lineC.addQuest(a);
    const b = new CaptureSpecificPokemonQuest('Foo');
    lineC.addQuest(b);
};
make(PokemonType.Water);
lineC.addQuest(new TalkToNPCQuest(Npc, 'mid'));
make(PokemonType.Fire);
const build = (name: string) => {
    return new CaptureSpecificPokemonQuest(name, 1);
};
lineC.addQuest(build('Nihilego'));
lineC.addQuest(new MultipleQuestsQuest([build('A'), build('B')], 'both'));
"""

HELPER_SRC = r"""
public static createTrial = (kind: string, line: QuestLine, flag?: boolean) => {
    const clear = new DefeatDungeonBossQuest('d', 'boss')
        .withDescription(`x ${kind}`);
    return line.addQuest(clear);
};
const lineD = new QuestLine('Helper Line', 'd');
lineD.addQuest(new TalkToNPCQuest(Npc, 'start'));
this.createTrial('a', lineD);
this.createTrial('b', lineD, true);
"""


class InlineAndNestedStepsTest(unittest.TestCase):
    def test_inline_step_is_recorded_in_order(self) -> None:
        steps = parse_quest_line_steps(INLINE_SRC)["Inline Line"]
        self.assertEqual([s["type"] for s in steps],
                         ["TalkToNPCQuest", "DefeatDungeonQuest",
                          "CustomQuest", "TalkToNPCQuest"])

    def test_inline_custom_quest_with_itemlist_focus(self) -> None:
        steps = parse_quest_line_steps(INLINE_SRC)["Inline Line"]
        self.assertEqual(
            steps[2],
            {"type": "CustomQuest", "itemKey": "Fire_stone", "amount": 5},
        )

    def test_multiple_quests_quest_is_exactly_one_step(self) -> None:
        steps = parse_quest_line_steps(NESTED_SRC)["Nested Line"]
        self.assertEqual(steps, [{"type": "MultipleQuestsQuest"},
                                 {"type": "TalkToNPCQuest"}])

    def test_closure_calls_expand_in_call_order(self) -> None:
        steps = parse_quest_line_steps(CLOSURE_SRC)["Closure Line"]
        self.assertEqual(
            [s["type"] for s in steps],
            ["CapturePokemonTypesQuest", "CaptureSpecificPokemonQuest",
             "TalkToNPCQuest",
             "CapturePokemonTypesQuest", "CaptureSpecificPokemonQuest",
             "CaptureSpecificPokemonQuest",  # addQuest(build('Nihilego'))
             "MultipleQuestsQuest"],
        )

    def test_helper_binds_questline_parameter_at_call_site(self) -> None:
        steps = parse_quest_line_steps(HELPER_SRC)["Helper Line"]
        self.assertEqual([s["type"] for s in steps],
                         ["TalkToNPCQuest", "DefeatDungeonBossQuest",
                          "DefeatDungeonBossQuest"])

    def test_unresolvable_addquest_argument_fails_loudly(self) -> None:
        src = ("const l = new QuestLine('Bad', 'd');\n"
               "l.addQuest(mystery);\n")
        with self.assertRaises(ValueError):
            parse_quest_line_steps(src)


class CheckStepCountTest(unittest.TestCase):
    def test_matching_counts_pass(self) -> None:
        check_step_count(2, "a.addQuest(x);\nb.addQuest(new Y());\n")

    def test_mismatch_raises_systemexit_with_numbers(self) -> None:
        with self.assertRaises(SystemExit) as ctx:
            check_step_count(1, "a.addQuest(x);\nb.addQuest(y);\n")
        self.assertIn("1", str(ctx.exception))
        self.assertIn("2", str(ctx.exception))

    def test_every_real_shape_in_fixtures_satisfies_invariant(self) -> None:
        # Parser must account for every `.addQuest(` in each fixture.
        for src in (FIXTURE_SRC, INLINE_SRC, NESTED_SRC, CLOSURE_SRC, HELPER_SRC):
            result = parse_quest_line_steps(src, with_site_count=True)[1]
            check_step_count(result, src)


COMMENT_SRC = r"""
const lineE = new QuestLine('Live Line', 'd');
const s1 = new TalkToNPCQuest(Npc, "it's fine // not a comment");
lineE.addQuest(s1);
// lineE.addQuest(ghost);
/* lineE.addQuest(new TalkToNPCQuest(Npc, 'x')); */
const s2 = new CustomQuest(7, 0, 'Get 7.', () => player.itemList.Fire_stone());
lineE.addQuest(s2);
/*
const lineF = new QuestLine('Dead Line', 'd');
lineF.addQuest(new TalkToNPCQuest(Npc, 'y'));
*/
"""


class CommentHandlingTest(unittest.TestCase):
    def test_commented_code_is_ignored(self) -> None:
        steps = parse_quest_line_steps(COMMENT_SRC)
        self.assertEqual(set(steps), {"Live Line"})
        self.assertEqual(
            steps["Live Line"],
            [{"type": "TalkToNPCQuest"},
             {"type": "CustomQuest", "itemKey": "Fire_stone", "amount": 7}],
        )

    def test_invariant_ignores_comments(self) -> None:
        _, sites = parse_quest_line_steps(COMMENT_SRC, with_site_count=True)
        self.assertEqual(sites, 2)
        check_step_count(sites, COMMENT_SRC)

    def test_strip_preserves_offsets_and_strings(self) -> None:
        out = strip_comments(COMMENT_SRC)
        self.assertEqual(len(out), len(COMMENT_SRC))
        self.assertIn("it's fine // not a comment", out)
        self.assertNotIn("ghost", out)


FOCUS_FORMS_SRC = r"""
const lineG = new QuestLine('Focus Forms', 'd');
lineG.addQuest(new CustomQuest(1, undefined, 'Obtain 1 Wishing Piece', player.itemList.Wishing_Piece).withInitialValue(0));
const spaced = new CustomQuest (3, 0, 'Spaced ctor.', () => player.itemList.Fire_stone());
lineG.addQuest(spaced);
const direct = new CustomQuest(4, 5, 'Direct call.', player.itemList.Leaf_stone());
lineG.addQuest(direct);
lineG.addQuest(new CustomQuest(2, 0, 'Not an item.', () => player.oakItems.count()));
"""


class CustomQuestFocusFormsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.steps = parse_quest_line_steps(FOCUS_FORMS_SRC)["Focus Forms"]

    def test_bare_observable_with_undefined_reward(self) -> None:
        self.assertEqual(
            self.steps[0],
            {"type": "CustomQuest", "itemKey": "Wishing_Piece", "amount": 1},
        )

    def test_space_before_constructor_paren(self) -> None:
        self.assertEqual(
            self.steps[1],
            {"type": "CustomQuest", "itemKey": "Fire_stone", "amount": 3},
        )

    def test_direct_call_without_arrow(self) -> None:
        self.assertEqual(
            self.steps[2],
            {"type": "CustomQuest", "itemKey": "Leaf_stone", "amount": 4},
        )

    def test_non_itemlist_focus_still_has_no_itemkey(self) -> None:
        self.assertEqual(self.steps[3], {"type": "CustomQuest"})


class GameVersionTest(unittest.TestCase):
    def test_reads_version_from_package_json(self) -> None:
        self.assertEqual(parse_game_version('{"name": "x", "version": "0.10.26"}'), "0.10.26")

    def test_missing_version_raises(self) -> None:
        with self.assertRaises(SystemExit):
            parse_game_version('{"name": "x"}')

    def test_non_semver_version_raises(self) -> None:
        with self.assertRaises(SystemExit):
            parse_game_version('{"version": "latest"}')

    def test_invalid_json_raises(self) -> None:
        with self.assertRaises(SystemExit):
            parse_game_version("not json")

    def test_payload_shape(self) -> None:
        lines = {"A": [{"type": "TalkToNPCQuest"}]}
        self.assertEqual(
            build_quest_steps_payload("0.10.26", lines),
            {"gameVersion": "0.10.26", "lines": lines},
        )


if __name__ == "__main__":
    unittest.main()
