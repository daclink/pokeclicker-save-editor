"""Tests for the data pipeline's version pin, manifest, PokemonType enum
parser, strict enum parsing and the per-entry PokemonList.ts type parser in
scripts/fetch_pokeclicker_data.py. Pure text parsing — no network.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import fetch_pokeclicker_data as f  # noqa: E402

# Shape of src/modules/enums/PokemonType.ts at v0.10.26 (quoted members,
# explicit values, `None = -1` sentinel, no `export` before `enum`).
POKEMON_TYPE_SRC = """enum PokemonType {
    'None' = -1,
    'Normal' = 0,
    'Fire' = 1,
    'Water' = 2,
    'Electric' = 3,
    'Grass' = 4,
    'Ice' = 5,
    'Fighting' = 6,
    'Poison' = 7,
    'Ground' = 8,
    'Flying' = 9,
    'Psychic' = 10,
    'Bug' = 11,
    'Rock' = 12,
    'Ghost' = 13,
    'Dragon' = 14,
    'Dark' = 15,
    'Steel' = 16,
    'Fairy' = 17,
}

export default PokemonType;
"""
TYPE_NAMES = f.parse_pokemon_type_names(POKEMON_TYPE_SRC)
T = {name: i for i, name in enumerate(TYPE_NAMES)}


class VersionPinTest(unittest.TestCase):
    def test_default_ref_is_the_tagged_release(self):
        self.assertEqual(f.PC_REF, f"v{f.GAME_VERSION}")
        self.assertTrue(f.PC_RAW.endswith(f"/{f.PC_REF}"))
        self.assertNotIn("develop", f.PC_RAW)

    def test_urls_are_built_from_the_ref(self):
        self.assertEqual(
            f.pc_url("package.json"),
            f"{f.PC_REPO_RAW}/{f.PC_REF}/package.json",
        )
        self.assertEqual(
            f.pc_url("src/x.ts", "develop"),
            f"{f.PC_REPO_RAW}/develop/src/x.ts",
        )

    def test_matching_version_on_default_ref_passes(self):
        self.assertEqual(f.check_game_version(f.GAME_VERSION, f.PC_REF), f.GAME_VERSION)

    def test_mismatched_version_on_default_ref_fails_loudly(self):
        with self.assertRaises(SystemExit) as cm:
            f.check_game_version("0.10.27", f.PC_REF)
        self.assertIn("0.10.27", str(cm.exception))
        self.assertIn(f.GAME_VERSION, str(cm.exception))

    def test_override_ref_accepts_any_version(self):
        self.assertEqual(f.check_game_version("0.10.27", "develop"), "0.10.27")

    def test_cli_default_and_override(self):
        self.assertEqual(f.parse_args([]).game_ref, f.PC_REF)
        self.assertEqual(f.parse_args(["--game-ref", "develop"]).game_ref, "develop")


class ManifestTest(unittest.TestCase):
    def test_manifest_shape(self):
        self.assertEqual(
            f.build_manifest("0.10.26", "v0.10.26"),
            {f.MANIFEST_VERSION_KEY: "0.10.26", f.MANIFEST_REF_KEY: "v0.10.26"},
        )
        self.assertEqual(f.MANIFEST_VERSION_KEY, "gameVersion")
        self.assertEqual(f.MANIFEST_REF_KEY, "gameRef")


class PokemonTypeNamesTest(unittest.TestCase):
    def test_names_in_index_order_without_none(self):
        self.assertEqual(len(TYPE_NAMES), f.EXPECTED_POKEMON_TYPE_COUNT)
        self.assertEqual(TYPE_NAMES[0], "Normal")
        self.assertEqual(TYPE_NAMES[1], "Fire")
        self.assertEqual(TYPE_NAMES[6], "Fighting")
        self.assertEqual(TYPE_NAMES[17], "Fairy")
        self.assertNotIn("None", TYPE_NAMES)

    def test_implicit_values_follow_typescript_numbering(self):
        src = POKEMON_TYPE_SRC.replace(" = 5,", ",").replace(" = 6,", ",")
        self.assertEqual(f.parse_pokemon_type_names(src), TYPE_NAMES)

    def test_gap_in_values_fails(self):
        src = POKEMON_TYPE_SRC.replace("'Ice' = 5", "'Ice' = 50")
        with self.assertRaises(SystemExit):
            f.parse_pokemon_type_names(src)

    def test_reordered_values_fail(self):
        src = POKEMON_TYPE_SRC.replace("'Fire' = 1", "'Fire' = 2").replace(
            "'Water' = 2", "'Water' = 1")
        with self.assertRaises(SystemExit):
            f.parse_pokemon_type_names(src)

    def test_wrong_count_fails(self):
        src = POKEMON_TYPE_SRC.replace("    'Fairy' = 17,\n", "")
        with self.assertRaises(SystemExit):
            f.parse_pokemon_type_names(src)


class StrictEnumTest(unittest.TestCase):
    def test_unrecognised_line_raises_with_the_line(self):
        src = "enum X {\n    Ok,\n    Two, Three,\n}"
        with self.assertRaises(SystemExit) as cm:
            f._parse_enum_idents(src, "X")
        self.assertIn("Two, Three", str(cm.exception))

    def test_line_and_block_comments_are_stripped_first(self):
        src = (
            "enum X {\n"
            "    // First generation (Typed)\n"
            "    A, // trailing\n"
            "    /* B,\n"
            "       C, */\n"
            "    D,\n"
            "}"
        )
        self.assertEqual(f._parse_enum_idents(src, "X"), ["A", "D"])

    def test_values_are_tracked(self):
        src = "enum X {\n    None = -1,\n    A,\n    B = 5,\n    C,\n}"
        self.assertEqual(
            f._parse_enum_members(src, "X"),
            [("None", -1), ("A", 0), ("B", 5), ("C", 6)],
        )


def _entry(pid, types, name="X"):
    tlist = ", ".join(f"PokemonType.{t}" for t in types)
    return (
        "    {\n"
        f"        'id': {pid},\n"
        f"        'name': '{name}',\n"
        f"        'type': [{tlist}],\n"
        "        'gender': { 'type': Genders.Genderless },\n"
        "    },\n"
    )


def _list_src(entries):
    return "export const pokemonList = createPokemonArray(\n" + "".join(entries) + ");\n"


class ParsePokemonTypesTest(unittest.TestCase):
    def setUp(self):
        self.max_id = f.MAX_ID
        f.MAX_ID = 3

    def tearDown(self):
        f.MAX_ID = self.max_id

    def _src(self, *extra):
        return _list_src([
            _entry(1, ["Grass", "Poison"]),
            _entry(1.01, ["Fire"]),
            _entry(2, ["Grass", "Poison"]),
            _entry(3, ["Water", "None"]),
            *extra,
        ])

    def test_per_entry_types_and_none_dropped(self):
        self.assertEqual(
            f.parse_pokemon_types(self._src(), TYPE_NAMES),
            [[T["Grass"], T["Poison"]], [T["Grass"], T["Poison"]], [T["Water"]]],
        )

    def test_entry_missing_type_fails_loudly(self):
        src = self._src().replace(
            "'id': 2,\n        'name': 'X',\n        'type': [PokemonType.Grass, PokemonType.Poison],\n",
            "'id': 2,\n        'name': 'X',\n",
        )
        with self.assertRaises(SystemExit) as cm:
            f.parse_pokemon_types(src, TYPE_NAMES)
        self.assertIn("2", str(cm.exception))

    def test_stray_type_between_entries_fails_loudly(self):
        src = self._src().replace(
            "    {\n        'id': 2,",
            "    'type': [PokemonType.Dragon],\n    {\n        'id': 2,",
        )
        with self.assertRaises(SystemExit):
            f.parse_pokemon_types(src, TYPE_NAMES)

    def test_unknown_type_name_fails(self):
        src = self._src().replace("PokemonType.Water", "PokemonType.Stellar")
        with self.assertRaises(SystemExit):
            f.parse_pokemon_types(src, TYPE_NAMES)

    def test_missing_species_fails(self):
        src = _list_src([_entry(1, ["Grass"]), _entry(3, ["Water"])])
        with self.assertRaises(SystemExit):
            f.parse_pokemon_types(src, TYPE_NAMES)

    def test_duplicate_species_fails(self):
        with self.assertRaises(SystemExit):
            f.parse_pokemon_types(self._src(_entry(2, ["Fire"])), TYPE_NAMES)

    def test_name_before_id_is_rejected(self):
        src = self._src().replace(
            "        'id': 2,\n        'name': 'X',\n",
            "        'name': 'X',\n        'id': 2,\n",
        )
        with self.assertRaises(SystemExit):
            f.parse_pokemon_types(src, TYPE_NAMES)


class PokemonTypeSentinelTest(unittest.TestCase):
    def _types(self):
        types = [[T["Normal"]] for _ in range(f.MAX_ID)]
        types[0] = [T["Grass"], T["Poison"]]
        types[24] = [T["Electric"]]
        return types

    def test_real_order_passes(self):
        f.check_pokemon_type_sentinels(self._types(), TYPE_NAMES)

    def test_bulbasaur_drift_fails(self):
        types = self._types()
        types[0] = [T["Grass"]]
        with self.assertRaises(SystemExit):
            f.check_pokemon_type_sentinels(types, TYPE_NAMES)

    def test_pikachu_drift_fails(self):
        types = self._types()
        types[24] = [T["Fire"]]
        with self.assertRaises(SystemExit):
            f.check_pokemon_type_sentinels(types, TYPE_NAMES)


class FormSentinelTest(unittest.TestCase):
    def test_known_form_name_passes(self):
        f.check_form_sentinel({f.FORM_SENTINEL_ID: {"name": f.FORM_SENTINEL_NAME, "types": [3]}})
        self.assertEqual(f.FORM_SENTINEL_ID, "25.01")
        self.assertEqual(f.FORM_SENTINEL_NAME, "Pikachu (Original Cap)")

    def test_shifted_name_fails(self):
        with self.assertRaises(SystemExit):
            f.check_form_sentinel({f.FORM_SENTINEL_ID: {"name": "Pikachu (Hoenn Cap)", "types": [3]}})

    def test_missing_form_fails(self):
        with self.assertRaises(SystemExit):
            f.check_form_sentinel({})


if __name__ == "__main__":
    unittest.main()
