"""Tests for the inventory-roster parsers in scripts/fetch_pokeclicker_data.py
(egg items, evolution items, mega stones) and the quoted-enum support they need.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import fetch_pokeclicker_data as f  # noqa: E402

GAME_CONSTANTS = """
export enum StoneType {
    'None' = -1,
    'Leaf_stone',
    'Fire_stone',
    'Kings_rock', // trailing comment
}

export enum EggItemType {
    'Fire_egg',
    'Dragon_egg',
    'Mystery_egg',
}

export enum MegaStoneType {
    Abomasite,
    Blue_Orb,
    Charizardite_X,
}
"""

ITEM_LIST = """
ItemList.Abomasite          = new MegaStoneItem(MegaStoneType.Abomasite, 'Abomasnow', 10000);
ItemList.Blue_Orb           = new MegaStoneItem(MegaStoneType.Blue_Orb, 'Kyogre', 10000);
ItemList.Charizardite_X     = new MegaStoneItem(MegaStoneType.Charizardite_X, 'Charizard', 10000);
ItemList.Fire_egg = new EggItem(EggItemType.Fire_egg, 1000, undefined, 'Fire Egg');
"""


class QuotedEnumTest(unittest.TestCase):
    def test_quoted_members_are_parsed_and_none_dropped(self):
        self.assertEqual(
            f._parse_enum_idents(GAME_CONSTANTS, "StoneType"),
            ["Leaf_stone", "Fire_stone", "Kings_rock"],
        )

    def test_unquoted_enums_still_parse(self):
        self.assertEqual(
            f._parse_enum_idents(GAME_CONSTANTS, "MegaStoneType"),
            ["Abomasite", "Blue_Orb", "Charizardite_X"],
        )

    def test_mismatched_quotes_are_not_accepted(self):
        src = "enum X {\n    'Leaf_stone,\n    Fire_stone',\n    Ok,\n}"
        self.assertEqual(f._parse_enum_idents(src, "X"), ["Ok"])


class ParseEggItemsTest(unittest.TestCase):
    def test_egg_items_in_enum_order(self):
        self.assertEqual(
            f.parse_egg_items(GAME_CONSTANTS),
            ["Fire_egg", "Dragon_egg", "Mystery_egg"],
        )


class ParseEvolutionItemsTest(unittest.TestCase):
    def test_evolution_items_in_enum_order_without_none(self):
        self.assertEqual(
            f.parse_evolution_items(GAME_CONSTANTS),
            ["Leaf_stone", "Fire_stone", "Kings_rock"],
        )


class ParseMegaStonesTest(unittest.TestCase):
    def test_join_enum_with_item_list_base(self):
        self.assertEqual(
            f.parse_mega_stones(GAME_CONSTANTS, ITEM_LIST),
            [
                {"stone": "Abomasite", "base": "Abomasnow"},
                {"stone": "Blue_Orb", "base": "Kyogre"},
                {"stone": "Charizardite_X", "base": "Charizard"},
            ],
        )

    def test_stone_without_item_list_entry_is_an_error(self):
        trimmed = ITEM_LIST.replace(
            "ItemList.Blue_Orb           = new MegaStoneItem(MegaStoneType.Blue_Orb, 'Kyogre', 10000);",
            "",
        )
        with self.assertRaises(SystemExit):
            f.parse_mega_stones(GAME_CONSTANTS, trimmed)

    def test_escaped_quote_in_base_name(self):
        consts = "enum MegaStoneType {\n    Farfetchite,\n}"
        items = "x = new MegaStoneItem(MegaStoneType.Farfetchite, 'Farfetch\\'d', 1);"
        self.assertEqual(
            f.parse_mega_stones(consts, items),
            [{"stone": "Farfetchite", "base": "Farfetch'd"}],
        )


if __name__ == "__main__":
    unittest.main()
