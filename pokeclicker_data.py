"""Static reference data for the editor: regions and Pokémon names.

Region IDs match PokeClicker's national-dex grouping. Hisui shares numbers
with prior generations and is not exposed as its own range here.
"""
from __future__ import annotations

# (region label, first id (inclusive), last id (inclusive))
REGION_RANGES: list[tuple[str, int, int]] = [
    ("Kanto",   1,    151),
    ("Johto",   152,  251),
    ("Hoenn",   252,  386),
    ("Sinnoh",  387,  493),
    ("Unova",   494,  649),
    ("Kalos",   650,  721),
    ("Alola",   722,  809),
    ("Galar",   810,  905),
    ("Paldea",  906,  1025),
]


# National-dex names. Only Kanto is currently filled out — IDs outside this
# range render as "?" so the dex tab still works for higher regions; you just
# see ID numbers without the friendly name.
KANTO_NAMES: list[str] = [
    "Bulbasaur", "Ivysaur", "Venusaur",
    "Charmander", "Charmeleon", "Charizard",
    "Squirtle", "Wartortle", "Blastoise",
    "Caterpie", "Metapod", "Butterfree",
    "Weedle", "Kakuna", "Beedrill",
    "Pidgey", "Pidgeotto", "Pidgeot",
    "Rattata", "Raticate",
    "Spearow", "Fearow",
    "Ekans", "Arbok",
    "Pikachu", "Raichu",
    "Sandshrew", "Sandslash",
    "Nidoran♀", "Nidorina", "Nidoqueen",
    "Nidoran♂", "Nidorino", "Nidoking",
    "Clefairy", "Clefable",
    "Vulpix", "Ninetales",
    "Jigglypuff", "Wigglytuff",
    "Zubat", "Golbat",
    "Oddish", "Gloom", "Vileplume",
    "Paras", "Parasect",
    "Venonat", "Venomoth",
    "Diglett", "Dugtrio",
    "Meowth", "Persian",
    "Psyduck", "Golduck",
    "Mankey", "Primeape",
    "Growlithe", "Arcanine",
    "Poliwag", "Poliwhirl", "Poliwrath",
    "Abra", "Kadabra", "Alakazam",
    "Machop", "Machoke", "Machamp",
    "Bellsprout", "Weepinbell", "Victreebel",
    "Tentacool", "Tentacruel",
    "Geodude", "Graveler", "Golem",
    "Ponyta", "Rapidash",
    "Slowpoke", "Slowbro",
    "Magnemite", "Magneton",
    "Farfetch'd",
    "Doduo", "Dodrio",
    "Seel", "Dewgong",
    "Grimer", "Muk",
    "Shellder", "Cloyster",
    "Gastly", "Haunter", "Gengar",
    "Onix",
    "Drowzee", "Hypno",
    "Krabby", "Kingler",
    "Voltorb", "Electrode",
    "Exeggcute", "Exeggutor",
    "Cubone", "Marowak",
    "Hitmonlee", "Hitmonchan",
    "Lickitung",
    "Koffing", "Weezing",
    "Rhyhorn", "Rhydon",
    "Chansey",
    "Tangela",
    "Kangaskhan",
    "Horsea", "Seadra",
    "Goldeen", "Seaking",
    "Staryu", "Starmie",
    "Mr. Mime",
    "Scyther",
    "Jynx",
    "Electabuzz",
    "Magmar",
    "Pinsir",
    "Tauros",
    "Magikarp", "Gyarados",
    "Lapras",
    "Ditto",
    "Eevee", "Vaporeon", "Jolteon", "Flareon",
    "Porygon",
    "Omanyte", "Omastar",
    "Kabuto", "Kabutops",
    "Aerodactyl",
    "Snorlax",
    "Articuno", "Zapdos", "Moltres",
    "Dratini", "Dragonair", "Dragonite",
    "Mewtwo", "Mew",
]
assert len(KANTO_NAMES) == 151, f"Kanto roster is 151 mons, got {len(KANTO_NAMES)}"


def name_for(pid: int) -> str:
    """Return a friendly name for a national-dex id, or '?' if unknown."""
    if 1 <= pid <= len(KANTO_NAMES):
        return KANTO_NAMES[pid - 1]
    return "?"


def region_for(pid: int) -> str:
    for label, lo, hi in REGION_RANGES:
        if lo <= pid <= hi:
            return label
    return "?"
