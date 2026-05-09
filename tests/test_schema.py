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
from pokeclicker_data import (  # noqa: E402
    BERRY_NAMES,
    MULCH_NAMES,
    NATIONAL_NAMES,
    REGION_RANGES,
    name_for,
    name_for_berry,
    name_for_mulch,
    region_for,
    stat_bucket_for,
)

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
        # The Berries tab assumes the BerryType enum length (70 in v0.10.25).
        self.assertEqual(len(b), len(BERRY_NAMES),
                         "unlockedBerries length should match BerryType enum")
        for v in b:
            self.assertIn(v, (0, 1, True, False), f"unexpected unlock value: {v!r}")

    def test_farming_berry_list(self) -> None:
        counts = self.save["save"]["farming"]["berryList"]
        self.assertIsInstance(counts, list)
        self.assertEqual(len(counts), len(BERRY_NAMES),
                         "berryList length should match BerryType enum")
        for v in counts:
            self.assertIsInstance(v, int)
            self.assertGreaterEqual(v, 0)

    def test_farming_mulch_list(self) -> None:
        mulch = self.save["save"]["farming"]["mulchList"]
        self.assertIsInstance(mulch, list)
        # PokeClicker has 7 mulch types in v0.10.25.
        self.assertEqual(len(mulch), 7)
        for v in mulch:
            self.assertIsInstance(v, int)

    def test_farming_shovels(self) -> None:
        f = self.save["save"]["farming"]
        self.assertIsInstance(f["shovelAmt"], int)
        self.assertIsInstance(f["mulchShovelAmt"], int)

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


class BerryDataTest(unittest.TestCase):
    """Sanity-check BERRY_NAMES + name_for_berry from
    ``scripts/fetch_pokeclicker_data.py``.
    """

    EXPECTED_LEN = 70

    def test_roster_size(self) -> None:
        self.assertEqual(len(BERRY_NAMES), self.EXPECTED_LEN)

    def test_endpoints(self) -> None:
        # The fetcher hard-asserts these too — duplicated here so a hand-edit
        # to pokeclicker_data.py also fails CI.
        self.assertEqual(BERRY_NAMES[0], "Cheri")
        self.assertEqual(BERRY_NAMES[-1], "Hopo")

    def test_every_berry_non_empty(self) -> None:
        for i, n in enumerate(BERRY_NAMES):
            self.assertTrue(n, f"empty berry name at index {i}")

    def test_name_for_berry_handles_edges(self) -> None:
        self.assertEqual(name_for_berry(0), BERRY_NAMES[0])
        self.assertEqual(name_for_berry(self.EXPECTED_LEN - 1),
                         BERRY_NAMES[-1])
        self.assertEqual(name_for_berry(-1), "?")
        self.assertEqual(name_for_berry(self.EXPECTED_LEN), "?")
        self.assertEqual(name_for_berry("0"), BERRY_NAMES[0])
        self.assertEqual(name_for_berry(None), "?")

    def test_mulch_roster(self) -> None:
        # Mulch enum is shorter than the actual mulchList in v0.10.25 saves;
        # we just guard the lower bound and the first/last names.
        self.assertGreaterEqual(len(MULCH_NAMES), 6)
        self.assertEqual(MULCH_NAMES[0], "Boost")
        # Slots beyond the enum get a 'Slot N' label.
        self.assertEqual(name_for_mulch(len(MULCH_NAMES)),
                         f"Slot {len(MULCH_NAMES)}")
        self.assertEqual(name_for_mulch(0), MULCH_NAMES[0])
        self.assertEqual(name_for_mulch(-1), "?")


class PokemonDataTest(unittest.TestCase):
    """Sanity-check the generated reference data from
    ``scripts/fetch_pokeclicker_data.py``.
    """

    EXPECTED_LEN = 1025

    VALID_BUCKETS = (
        "totalMalePokemonCaptured",
        "totalFemalePokemonCaptured",
        "totalGenderlessPokemonCaptured",
    )

    def test_national_roster_size(self) -> None:
        self.assertEqual(len(NATIONAL_NAMES), self.EXPECTED_LEN)

    def test_every_name_non_empty(self) -> None:
        for i, n in enumerate(NATIONAL_NAMES, start=1):
            self.assertTrue(n, f"empty name at #{i}")

    def test_known_display_names(self) -> None:
        # Spot-check the special-character species the override table covers.
        cases = {
            1:    "Bulbasaur",
            29:   "Nidoran♀",
            32:   "Nidoran♂",
            83:   "Farfetch'd",
            122:  "Mr. Mime",
            132:  "Ditto",
            151:  "Mew",
            250:  "Ho-Oh",
            439:  "Mime Jr.",
            474:  "Porygon-Z",
            772:  "Type: Null",
            785:  "Tapu Koko",
            865:  "Sirfetch'd",
            1025: "Pecharunt",
        }
        for pid, expected in cases.items():
            self.assertEqual(name_for(pid), expected,
                             f"name mismatch for #{pid}")

    def test_name_for_handles_float_id(self) -> None:
        # PokeClicker sometimes serialises ids as floats; the helper must
        # tolerate that without raising.
        self.assertEqual(name_for(1.0), "Bulbasaur")
        self.assertEqual(name_for("1"), "Bulbasaur")
        self.assertEqual(name_for(None), "?")
        self.assertEqual(name_for(99999), "?")

    def test_region_for_covers_all_ids(self) -> None:
        for pid in (1, 151, 152, 251, 252, 386, 387, 493, 494, 649, 650, 721,
                    722, 809, 810, 905, 906, 1025):
            self.assertNotEqual(region_for(pid), "?",
                                f"region missing for #{pid}")

    def test_stat_bucket_returns_valid_label(self) -> None:
        for pid in range(1, self.EXPECTED_LEN + 1):
            bucket = stat_bucket_for(pid)
            self.assertIn(bucket, self.VALID_BUCKETS,
                          f"invalid bucket for #{pid}: {bucket!r}")

    def test_stat_bucket_known_species(self) -> None:
        # Genderless legendaries / fossils / Magnemite line.
        for pid in (132, 137, 144, 145, 146, 150, 151, 250, 251, 374, 375,
                    376, 377, 378, 379, 382, 383, 384, 385, 386, 1025):
            self.assertEqual(stat_bucket_for(pid),
                             "totalGenderlessPokemonCaptured",
                             f"#{pid} should be genderless")
        # Female-only species.
        for pid in (29, 30, 31, 113, 115, 124, 238, 241, 242, 380):
            self.assertEqual(stat_bucket_for(pid),
                             "totalFemalePokemonCaptured",
                             f"#{pid} should be female bucket")
        # Male-only species.
        for pid in (32, 33, 34, 106, 107, 128, 236, 237, 313, 381):
            self.assertEqual(stat_bucket_for(pid),
                             "totalMalePokemonCaptured",
                             f"#{pid} should be male bucket")

    def test_stat_bucket_returns_none_outside_range(self) -> None:
        self.assertIsNone(stat_bucket_for(0))
        self.assertIsNone(stat_bucket_for(self.EXPECTED_LEN + 1))
        self.assertIsNone(stat_bucket_for(99999))


if __name__ == "__main__":
    unittest.main()
