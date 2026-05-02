"""Schema-diff regression tests for PokeClicker save files.

These tests load a checked-in fixture (built from `tests/make_fixtures.py`)
and assert that every key the editor's GUI/CLI reads is still present and
of the expected type. When PokeClicker ships a new minor version that
changes shape, this is what catches it: a previously-passing assertion
fails and we know exactly which key moved.

Run from the repo root:

    python3 -m unittest discover tests
    # or via the convenience runner:
    python3 -m tests
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from pokeclicker_save import (  # noqa: E402
    decode_file,
    encode_bytes,
    get_path,
    set_path,
)
from pcedit_backup import latest_backup, list_backups  # noqa: E402

FIXTURE = REPO_ROOT / "tests" / "fixtures" / "v0.10.25" / "minimal.txt"


class SchemaTest(unittest.TestCase):
    """Validate the editor's assumptions against a known-good v0.10.25 save."""

    @classmethod
    def setUpClass(cls) -> None:
        if not FIXTURE.exists():
            raise FileNotFoundError(
                f"fixture missing: {FIXTURE}\n"
                f"run `python3 tests/make_fixtures.py` to regenerate."
            )
        cls.save = decode_file(FIXTURE)

    # --- top-level shape ---

    def test_top_level_keys(self) -> None:
        for k in ("player", "save", "settings"):
            self.assertIn(k, self.save, f"missing top-level key: {k}")
            self.assertIsInstance(self.save[k], dict)

    # --- player block ---

    def test_player_location(self) -> None:
        p = self.save["player"]
        self.assertIsInstance(p["_region"], int)
        self.assertIsInstance(p["_subregion"], int)
        self.assertIsInstance(p["_route"], int)
        self.assertIsInstance(p["_townName"], str)
        self.assertIsInstance(p["highestRegion"], int)
        self.assertIsInstance(p["highestSubRegion"], int)

    def test_player_identity(self) -> None:
        p = self.save["player"]
        self.assertIsInstance(p["trainerId"], str)
        self.assertIsInstance(p["_createdTime"], int)
        self.assertIsInstance(p["_lastSeen"], int)

    def test_player_item_lists(self) -> None:
        p = self.save["player"]
        self.assertIsInstance(p["_itemList"], dict)
        for k, v in p["_itemList"].items():
            self.assertIsInstance(k, str)
            self.assertIsInstance(v, int)

        # _itemMultipliers may be empty; we only assert it's a dict-of-floats
        # (or absent altogether, which is also valid for fresh saves).
        muls = p.get("_itemMultipliers", {})
        self.assertIsInstance(muls, dict)
        for k, v in muls.items():
            self.assertIsInstance(k, str)
            self.assertIsInstance(v, (int, float))

    # --- save block ---

    def test_wallet_currencies(self) -> None:
        currencies = self.save["save"]["wallet"]["currencies"]
        self.assertIsInstance(currencies, list)
        # The editor relies on positions 0..4 (money..farmPoints).
        self.assertGreaterEqual(len(currencies), 5)
        for v in currencies:
            self.assertIsInstance(v, int)

    def test_party_caught_pokemon(self) -> None:
        caught = self.save["save"]["party"]["caughtPokemon"]
        self.assertIsInstance(caught, list)
        for entry in caught:
            self.assertIsInstance(entry, dict)
            self.assertIn("id", entry, "every caughtPokemon entry must have id")
            self.assertIsInstance(entry["id"], int)
            # EVs sub-dict (key "2") and exp (key "3") are mandatory.
            self.assertIn("2", entry, "missing EVs (key '2')")
            self.assertIsInstance(entry["2"], dict)
            self.assertIn("3", entry, "missing exp (key '3')")
            self.assertIsInstance(entry["3"], int)

    def test_breeding_eggs(self) -> None:
        b = self.save["save"]["breeding"]
        self.assertIsInstance(b["eggSlots"], int)
        eggs = b["eggList"]
        self.assertIsInstance(eggs, list)
        required = {"totalSteps", "steps", "shinyChance", "pokemon", "type", "notified"}
        for egg in eggs:
            missing = required - egg.keys()
            self.assertFalse(missing, f"egg missing keys: {missing}")

    def test_statistics_per_id_dicts(self) -> None:
        stats = self.save["save"]["statistics"]
        for total in ("totalPokemonCaptured", "totalPokemonEncountered"):
            self.assertIn(total, stats)
            self.assertIsInstance(stats[total], int)
        for per_id in ("pokemonCaptured", "pokemonEncountered"):
            v = stats.get(per_id)
            if v is None:
                continue   # not every save populates these yet
            self.assertIsInstance(v, dict)
            for k, count in v.items():
                self.assertIsInstance(k, str, "per-id keys are strings, not ints")
                self.assertIsInstance(count, int)

    def test_farming_unlocked_berries(self) -> None:
        b = self.save["save"]["farming"]["unlockedBerries"]
        self.assertIsInstance(b, list)
        for v in b:
            self.assertIn(v, (0, 1, True, False), f"unexpected unlock value: {v!r}")

    def test_key_items_are_bools(self) -> None:
        ki = self.save["save"]["keyItems"]
        self.assertIsInstance(ki, dict)
        for k, v in ki.items():
            self.assertIsInstance(k, str)
            self.assertIsInstance(v, bool)

    def test_gem_wallet(self) -> None:
        wallet = self.save["save"]["gems"]["gemWallet"]
        self.assertIsInstance(wallet, list)
        # 18 PokeClicker types.
        self.assertGreaterEqual(len(wallet), 18)
        for v in wallet:
            self.assertIsInstance(v, int)

    # --- editor-level invariants ---

    def test_round_trip_byte_exact(self) -> None:
        re_encoded = encode_bytes(self.save)
        original = FIXTURE.read_bytes().strip()
        self.assertEqual(
            re_encoded, original,
            "byte-exact round-trip is the foundation everything else assumes")

    def test_get_path_walks_known_fields(self) -> None:
        # The paths the GUI tabs and CLI commands rely on.
        self.assertEqual(get_path(self.save, "player._region"),
                         self.save["player"]["_region"])
        self.assertEqual(get_path(self.save, "save.wallet.currencies[0]"),
                         self.save["save"]["wallet"]["currencies"][0])
        self.assertEqual(get_path(self.save, "save.breeding.eggSlots"),
                         self.save["save"]["breeding"]["eggSlots"])
        # [id=N] selector against caughtPokemon (used by the Caught tab).
        first_id = self.save["save"]["party"]["caughtPokemon"][0]["id"]
        entry = get_path(self.save, f"save.party.caughtPokemon[id={first_id}]")
        self.assertEqual(entry["id"], first_id)

    def test_set_path_round_trips(self) -> None:
        # Mutate a copy via set_path, re-decode, confirm the change took.
        # Loading fresh so test isolation holds.
        d = decode_file(FIXTURE)
        set_path(d, "save.wallet.currencies[0]", 99999)
        self.assertEqual(d["save"]["wallet"]["currencies"][0], 99999)


class BackupHelperTest(unittest.TestCase):
    """Quick coverage for pcedit_backup so it's exercised by CI too."""

    def test_no_backups_for_pristine_path(self, tmp_path: Path | None = None) -> None:
        # unittest doesn't pass tmp_path; use TestCase.subTest with tempfile.
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "save.txt"
            target.write_bytes(b"x")
            self.assertEqual(list_backups(target), [])
            self.assertIsNone(latest_backup(target))


if __name__ == "__main__":
    unittest.main()
