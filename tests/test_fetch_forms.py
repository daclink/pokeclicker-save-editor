"""Tests for the pokémon-forms parser in scripts/fetch_pokeclicker_data.py.

Forms (regional variants, Alcremie flavours, costume Pikachu, megas…) use
fractional ids in PokeClicker's PokemonList.ts and in saves (e.g. 869.01).
The parser turns them into a lookup table keyed the way JavaScript would
stringify the number, so the web app can match `String(entry.id)`.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import fetch_pokeclicker_data as f  # noqa: E402

# Trimmed, representative PokemonList.ts shape (nested objects, escaped
# quotes, trailing-zero literal, nativeRegion, negative special id).
SAMPLE = """
export const pokemonList = createPokemonArray(
    {
        'id': 26,
        'name': 'Raichu',
        'type': [PokemonType.Electric],
        'base': { 'hitpoints': 60, 'attack': 90 },
    },
    {
        'id': 26.01,
        'name': 'Alolan Raichu',
        'nativeRegion': Region.alola,
        'type': [PokemonType.Electric, PokemonType.Psychic],
        'base': { 'hitpoints': 60 },
    },
    {
        'id': 25.10,
        'name': 'Pikachu (Rock Star)',
        'type': [PokemonType.Electric],
    },
    {
        'id': 83.01,
        'name': 'Galarian Farfetch\\'d',
        'nativeRegion': Region.galar,
        'type': [PokemonType.Fighting],
    },
    {
        'id': 58.01,
        'name': 'Hisuian Growlithe',
        'nativeRegion': Region.hisui,
        'type': [PokemonType.Fire, PokemonType.Rock],
    },
    {
        'id': -966.01,
        'name': 'Special Thing',
        'nativeRegion': Region.none,
        'type': [PokemonType.Steel, PokemonType.None],
    },
);
"""


class NormalizeFormIdTest(unittest.TestCase):
    def test_matches_javascript_number_to_string(self):
        # JS: String(25.10) === '25.1', String(869.01) === '869.01'
        self.assertEqual(f.normalize_form_id("25.10"), "25.1")
        self.assertEqual(f.normalize_form_id("869.01"), "869.01")
        self.assertEqual(f.normalize_form_id("869.70"), "869.7")
        self.assertEqual(f.normalize_form_id("6.04"), "6.04")
        self.assertEqual(f.normalize_form_id("-966.01"), "-966.01")

    def test_rejects_integers_and_garbage(self):
        for bad in ("26", "0", "26.0", "", "abc"):
            with self.assertRaises(ValueError, msg=bad):
                f.normalize_form_id(bad)


class ParsePokemonFormsTest(unittest.TestCase):
    def setUp(self):
        self.forms = f.parse_pokemon_forms(SAMPLE)

    def test_only_fractional_ids_are_forms(self):
        self.assertNotIn("26", self.forms)
        self.assertEqual(
            set(self.forms), {"26.01", "25.1", "83.01", "58.01", "-966.01"}
        )

    def test_name_and_types(self):
        self.assertEqual(self.forms["26.01"]["name"], "Alolan Raichu")
        self.assertEqual(self.forms["26.01"]["types"], [3, 10])  # Electric/Psychic

    def test_escaped_quote_is_unescaped(self):
        self.assertEqual(self.forms["83.01"]["name"], "Galarian Farfetch'd")

    def test_trailing_zero_literal_is_normalized(self):
        self.assertEqual(self.forms["25.1"]["name"], "Pikachu (Rock Star)")

    def test_region_only_when_it_maps_to_a_known_region(self):
        self.assertEqual(self.forms["26.01"]["region"], "Alola")
        self.assertEqual(self.forms["83.01"]["region"], "Galar")
        # Hisui / none aren't REGION_RANGES labels → no override (web falls
        # back to the base species' dex region).
        self.assertNotIn("region", self.forms["58.01"])
        self.assertNotIn("region", self.forms["-966.01"])

    def test_none_type_is_dropped(self):
        self.assertEqual(self.forms["-966.01"]["types"], [16])  # Steel only

    def test_duplicate_form_id_is_an_error(self):
        dup = SAMPLE.replace("'id': 25.10", "'id': 26.01")
        with self.assertRaises(SystemExit):
            f.parse_pokemon_forms(dup)

    def test_form_without_name_is_an_error(self):
        broken = SAMPLE.replace("'name': 'Alolan Raichu',", "")
        with self.assertRaises(SystemExit):
            f.parse_pokemon_forms(broken)


if __name__ == "__main__":
    unittest.main()
