"""Unit tests for the UndergroundItems.ts roster parser in
scripts/fetch_pokeclicker_data.py — pure text parsing, no network.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from fetch_pokeclicker_data import (  # noqa: E402
    check_underground_items,
    parse_underground_items,
)

# Same shapes as the real file: a plain treasure (default Diamond), an
# explicit valueType, each subclass, the mega-stone enum-first argument
# order, and a commented-out duplicate of a live line.
FIXTURE_SRC = r"""
// Diamond Items
UndergroundItems.addItem(new UndergroundItem(1, 'Rare_bone', [[1, 0], [1, 1]], 100));
UndergroundItems.addItem(new UndergroundGemItem(100, 'Draco_plate', [[1, 1]], PokemonType.Dragon));
UndergroundItems.addItem(new UndergroundItem(200, 'Helix_fossil', [[0, 1]], 0, UndergroundItemValueType.Fossil));
UndergroundItems.addItem(new UndergroundFossilPieceItem(211, 'Fossilized_bird', [[1]], 0, new MaxRegionRequirement(Region.galar)));
UndergroundItems.addItem(new UndergroundEvolutionItem(305, 'Sun_stone', [[0, 1]], StoneType.Sun_stone, 1, new MaxRegionRequirement(Region.johto)));
// UndergroundItems.addItem(new UndergroundEvolutionItem(305, [[0, 1, 0]], StoneType.Sun_stone, 1));
/* UndergroundItems.addItem(new UndergroundItem(999, 'Ghost_item', [[1]], 1)); */
UndergroundItems.addItem(new UndergroundShardItem(400, 'Red_shard', [[1, 1]]));
UndergroundItems.addItem(new UndergroundMegaStoneItem(MegaStoneType.Aerodactylite, 500, 'Aerodactylite', [[1]], 'Aerodactyl', 0));
UndergroundItems.addItem(new UndergroundItem(600, 'Palaeontologist_token', [[0, 0, 1],
    [1, 1, 1]], 0, UndergroundItemValueType.Special, new MaxRegionRequirement(Region.galar)));
"""

NAME_TYPE_SRC = """
/* comment with 'quotes' */
type UndergroundItemNameType
    = 'Rare Bone'
    | 'Draco Plate'
    | 'Helix Fossil'
    | 'Fossilized Bird'
    | 'Sun Stone'
    | 'Red Shard'
    | 'Aerodactylite'
    | 'Palaeontologist Token';
"""


class ParseUndergroundItemsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.items = parse_underground_items(FIXTURE_SRC)
        self.by_key = {i["key"]: i for i in self.items}

    def test_parses_every_live_item_in_order(self) -> None:
        self.assertEqual(
            [i["key"] for i in self.items],
            ["Rare_bone", "Draco_plate", "Helix_fossil", "Fossilized_bird",
             "Sun_stone", "Red_shard", "Aerodactylite", "Palaeontologist_token"],
        )

    def test_commented_out_items_are_skipped(self) -> None:
        self.assertNotIn("Ghost_item", self.by_key)
        self.assertEqual([i["id"] for i in self.items].count(305), 1)

    def test_plain_item_defaults_to_diamond(self) -> None:
        self.assertEqual(self.by_key["Rare_bone"], {"id": 1, "key": "Rare_bone", "valueType": "Diamond"})

    def test_explicit_value_type_wins(self) -> None:
        self.assertEqual(self.by_key["Helix_fossil"]["valueType"], "Fossil")
        self.assertEqual(self.by_key["Palaeontologist_token"]["valueType"], "Special")

    def test_subclass_sets_value_type(self) -> None:
        self.assertEqual(self.by_key["Draco_plate"]["valueType"], "Gem")
        self.assertEqual(self.by_key["Fossilized_bird"]["valueType"], "FossilPiece")
        self.assertEqual(self.by_key["Sun_stone"]["valueType"], "EvolutionItem")
        self.assertEqual(self.by_key["Red_shard"]["valueType"], "Shard")

    def test_mega_stone_enum_first_argument_order(self) -> None:
        self.assertEqual(self.by_key["Aerodactylite"], {"id": 500, "key": "Aerodactylite", "valueType": "MegaStone"})

    def test_unknown_subclass_aborts(self) -> None:
        with self.assertRaises(SystemExit):
            parse_underground_items("UndergroundItems.addItem(new UndergroundWeirdItem(7, 'X', [[1]]));")

    def test_unparseable_add_item_aborts(self) -> None:
        with self.assertRaises(SystemExit):
            parse_underground_items("UndergroundItems.addItem(someHelper());")


class CheckUndergroundItemsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.items = parse_underground_items(FIXTURE_SRC)

    def test_consistent_sources_pass(self) -> None:
        check_underground_items(self.items, NAME_TYPE_SRC)

    def test_name_the_parser_missed_aborts(self) -> None:
        with self.assertRaises(SystemExit):
            check_underground_items(self.items[:-1], NAME_TYPE_SRC)

    def test_items_newer_than_the_name_type_are_allowed(self) -> None:
        # The game regenerates UndergroundItemNameType by hand; it lags.
        stale = NAME_TYPE_SRC.replace("\n    | 'Palaeontologist Token'", "")
        self.assertNotIn("Palaeontologist", stale)
        check_underground_items(self.items, stale)

    def test_duplicate_id_aborts(self) -> None:
        dup = self.items + [{"id": 1, "key": "Other", "valueType": "Diamond"}]
        names = NAME_TYPE_SRC.replace(";", "\n    | 'Other';")
        with self.assertRaises(SystemExit):
            check_underground_items(dup, names)



if __name__ == "__main__":
    unittest.main()
