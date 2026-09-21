#!/usr/bin/env python3
"""Fetch reference data and (re)generate ``pokeclicker_data.py``.

Two upstream sources, both stdlib-only:

1. **PokeAPI** (``https://pokeapi.co``) — display names and gender rates for
   the 1025-entry national dex. Each species response is cached under
   ``.cache/pokeapi/<id>.json`` so re-runs are instant. The cache directory
   is gitignored (covered by the existing ``.cache`` rule).

2. **PokeClicker source** (``BerryType.ts`` on GitHub) — the canonical 70-name
   ``BerryType`` enum. Fetched verbatim and parsed into a ``BERRY_NAMES``
   list whose indices match ``save.farming.berryList`` /
   ``save.farming.unlockedBerries`` positions.

Run once locally; commit the regenerated module. The end product:

- ``NATIONAL_NAMES``: list of 1025 display names, indexed by ``pid - 1``.
- ``_BUCKET_INDEX`` + ``_BUCKET_LABELS``: compact compressed encoding of which
  ``save.statistics.total<…>PokemonCaptured`` counter to bump per species.
- ``BERRY_NAMES``: list of 70 berry display names, indexed by BerryType id.
- ``name_for(pid)``, ``stat_bucket_for(pid)``, ``region_for(pid)``,
  ``name_for_berry(idx)`` helpers.

Stdlib only — no requests, no toml.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = REPO_ROOT / ".cache" / "pokeapi"
DATA_DIR = REPO_ROOT / "data"

# Region IDs match PokeClicker's national-dex grouping. Hisui shares numbers
# with prior generations and is not exposed as its own range here.
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

SPECIES_URL = "https://pokeapi.co/api/v2/pokemon-species/{id}"
MAX_ID = 1025
THROTTLE_SEC = 0.05      # ~20 req/s; PokeAPI rate-limits are far more generous
TIMEOUT_SEC = 10
USER_AGENT = "pcedit-fetcher/1.0 (+https://github.com/daclink/pokeclicker-save-editor)"

# PokeClicker source — enum modules live here. Default branch is `develop`.
PC_RAW = "https://raw.githubusercontent.com/pokeclicker/pokeclicker/develop"
BERRY_TYPE_URL = f"{PC_RAW}/src/modules/enums/BerryType.ts"
MULCH_TYPE_URL = f"{PC_RAW}/src/modules/enums/MulchType.ts"
POKEMON_LIST_URL = f"{PC_RAW}/src/modules/pokemons/PokemonList.ts"
GAME_CONSTANTS_URL = f"{PC_RAW}/src/modules/GameConstants.ts"
ITEM_LIST_URL = f"{PC_RAW}/src/modules/items/ItemList.ts"

# Canonical PokeClicker PokemonType enum order (0 Normal .. 17 Fairy).
POKEMON_TYPE_ORDER = [
    "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting",
    "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost",
    "Dragon", "Dark", "Steel", "Fairy",
]
EXPECTED_BERRY_COUNT = 70
EXPECTED_FIRST_BERRY = "Cheri"
EXPECTED_LAST_BERRY = "Hopo"
EXPECTED_MULCH_MIN = 6   # save.farming.mulchList may carry extra slots
EXPECTED_EGG_ITEM_COUNT = 7     # EggItemType: Fire/Water/Grass/Fighting/Electric/Dragon/Mystery
EXPECTED_EVOLUTION_ITEMS_MIN = 50  # StoneType minus None (51 as of 2026-09)
EXPECTED_MEGA_STONES_MIN = 50   # MegaStoneType (50 as of 2026-09)
EXPECTED_FORMS_MIN = 600  # fractional-id entries in PokemonList.ts (610 as of 2026-09)

# PokeAPI returns kebab-case names that don't always round-trip to the
# canonical Pokémon-games display name. For most species the optional
# species.names[] English entry is good enough; this table covers the rest.
DISPLAY_NAME_OVERRIDES: dict[int, str] = {
    29: "Nidoran♀",     # api: nidoran-f
    32: "Nidoran♂",     # api: nidoran-m
    83: "Farfetch'd",
    122: "Mr. Mime",
    250: "Ho-Oh",
    439: "Mime Jr.",
    474: "Porygon-Z",
    772: "Type: Null",
    782: "Jangmo-o",
    783: "Hakamo-o",
    784: "Kommo-o",
    785: "Tapu Koko",
    786: "Tapu Lele",
    787: "Tapu Bulu",
    788: "Tapu Fini",
    865: "Sirfetch'd",
    866: "Mr. Rime",
}

# Bucket labels indexed by digit-character. The data file embeds these as
# values; the per-id index is a compact digit string.
BUCKET_LABELS = (
    "totalMalePokemonCaptured",          # 0
    "totalFemalePokemonCaptured",        # 1
    "totalGenderlessPokemonCaptured",    # 2
)


def kebab_to_display(name: str) -> str:
    """Default fallback prettifier: 'foo-bar' -> 'Foo-Bar'."""
    return "-".join(part.capitalize() for part in name.split("-"))


def gender_bucket_index(gender_rate: int) -> int:
    """Map PokeAPI gender_rate to an index into BUCKET_LABELS.

    PokeAPI scale (per official docs):
        -1: genderless
         0: male only
         1-7: mixed (1 = 87.5% M, 4 = 50/50, 7 = 12.5% M)
         8: female only
    Rule:
      - genderless  -> 2
      - 0..4 (incl. 50/50) -> 0 (male bucket)
      - 5..8 -> 1 (female bucket)
    """
    if gender_rate == -1:
        return 2
    if 0 <= gender_rate <= 4:
        return 0
    return 1


def _fetch_url(url: str) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
        return resp.read()


def _fetch_json(url: str) -> dict:
    return json.loads(_fetch_url(url).decode("utf-8"))


def fetch_species(pid: int, *, retries: int = 3) -> dict:
    """Return the species JSON for ``pid``, hitting cache first."""
    cache = CACHE_DIR / f"{pid}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    url = SPECIES_URL.format(id=pid)
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            data = _fetch_json(url)
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(data), encoding="utf-8")
            time.sleep(THROTTLE_SEC)
            return data
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            wait = 2 ** attempt
            sys.stderr.write(f"  attempt {attempt + 1}/{retries} for id {pid}: {e}; "
                             f"retry in {wait}s\n")
            time.sleep(wait)
    raise SystemExit(f"PokeAPI fetch failed for id {pid}: {last_err}")


def display_name(species: dict, pid: int) -> str:
    """Pick the best display name for a species.

    Priority:
      1. ``DISPLAY_NAME_OVERRIDES`` — hand-curated for species the API spells
         in a way that loses canonical punctuation/symbols.
      2. ``species.names[]`` entry where ``language.name == 'en'`` — PokeAPI
         provides the proper display name for many but not all species.
      3. Default kebab-to-titlecase prettifier.
    """
    if pid in DISPLAY_NAME_OVERRIDES:
        return DISPLAY_NAME_OVERRIDES[pid]
    for entry in species.get("names") or []:
        lang = entry.get("language") or {}
        if lang.get("name") == "en" and entry.get("name"):
            return entry["name"]
    return kebab_to_display(species.get("name") or "?")


# --- berry parser -----------------------------------------------------------

# Identifier line inside the BerryType enum body. The enum has section
# comments interspersed (`// First generation`, `// Fourth Generation
# (Typed)` — note the parens) that must be stripped. Bare identifiers
# (optionally followed by `,` or `= -1` for the None sentinel) are the
# entries we want.
# Members may be bare (`Cheri,`) or quoted (`'Leaf_stone',` in StoneType /
# EggItemType); the backreference requires matching quotes on both sides.
_ENUM_LINE = re.compile(
    r"^\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*(?:=\s*-?\d+\s*)?,?\s*$"
)


def _fetch_with_retry(url: str, *, label: str, retries: int = 3) -> str:
    """Fetch ``url`` with linear-backoff retries; return decoded text."""
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            return _fetch_url(url).decode("utf-8")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            wait = 2 ** attempt
            sys.stderr.write(f"  {label} attempt {attempt + 1}/{retries}: {e}; "
                             f"retry in {wait}s\n")
            time.sleep(wait)
    raise SystemExit(f"{label} fetch failed: {last_err}")


def _parse_enum_idents(src: str, enum_name: str) -> list[str]:
    """Return identifiers in declaration order from ``enum <name> { ... }``,
    skipping the ``None = -1`` sentinel and blank/comment lines.

    The parser is permissive: section comments like ``// Fourth Generation
    (Typed)`` (parens inside the comment) are stripped, and it tolerates
    optional trailing commas or explicit ``= <int>`` assignments.
    """
    m = re.search(r"enum\s+" + re.escape(enum_name) + r"\s*\{(.*?)\}",
                  src, re.DOTALL)
    if not m:
        raise SystemExit(f"could not locate `enum {enum_name} {{ ... }}` in source")
    body = m.group(1)

    idents: list[str] = []
    for raw in body.splitlines():
        line = raw.split("//", 1)[0].strip()
        if not line:
            continue
        match = _ENUM_LINE.match(line)
        if not match:
            sys.stderr.write(f"  {enum_name}: skipping unrecognized line: {raw!r}\n")
            continue
        ident = match.group(2)
        if ident == "None":
            continue
        idents.append(ident)
    return idents


def fetch_berry_names(*, retries: int = 3) -> list[str]:
    """Pull BerryType.ts from the PokeClicker repo and parse out the 70 names.

    Hard-asserts length 70, first == 'Cheri', last == 'Hopo' — the cheapest
    defense against an upstream rename or section reorder.
    """
    src = _fetch_with_retry(BERRY_TYPE_URL, label="BerryType.ts", retries=retries)
    names = _parse_enum_idents(src, "BerryType")

    if len(names) != EXPECTED_BERRY_COUNT:
        raise SystemExit(
            f"expected {EXPECTED_BERRY_COUNT} berries from BerryType.ts, "
            f"got {len(names)}: {names!r}"
        )
    if names[0] != EXPECTED_FIRST_BERRY:
        raise SystemExit(
            f"first berry should be {EXPECTED_FIRST_BERRY!r}, got {names[0]!r}"
        )
    if names[-1] != EXPECTED_LAST_BERRY:
        raise SystemExit(
            f"last berry should be {EXPECTED_LAST_BERRY!r}, got {names[-1]!r}"
        )
    return names


def fetch_mulch_names(*, retries: int = 3) -> list[str]:
    """Pull MulchType.ts and return display names (``Boost_Mulch`` -> ``Boost``).

    Hard-asserts at least ``EXPECTED_MULCH_MIN`` entries. Real saves often
    carry one more slot in ``mulchList`` than the enum names; the GUI
    handles that by labeling extra slots generically.
    """
    src = _fetch_with_retry(MULCH_TYPE_URL, label="MulchType.ts", retries=retries)
    raw = _parse_enum_idents(src, "MulchType")
    if len(raw) < EXPECTED_MULCH_MIN:
        raise SystemExit(
            f"expected at least {EXPECTED_MULCH_MIN} mulch entries, "
            f"got {len(raw)}: {raw!r}"
        )
    # 'Boost_Mulch' -> 'Boost'; if a future entry doesn't end with '_Mulch',
    # fall back to the raw identifier.
    return [n[:-len("_Mulch")] if n.endswith("_Mulch") else n for n in raw]


def fetch_pokemon_types(*, retries: int = 3) -> list[list[int]]:
    """Pull PokemonList.ts and return per-species type indices, id 1..MAX_ID.

    Each entry has an ``'id': N`` then a ``'type': [PokemonType.A, ...]``.
    We map type names to the canonical enum indices and keep only integer
    national-dex ids (regional forms use fractional ids like 19.01). Returns
    a list of length MAX_ID where entry ``i`` is the type list for dex id
    ``i + 1`` (one or two indices).
    """
    src = _fetch_with_retry(POKEMON_LIST_URL, label="PokemonList.ts",
                            retries=retries)
    tidx = {name: i for i, name in enumerate(POKEMON_TYPE_ORDER)}
    by_id: dict[int, list[int]] = {}
    cur_id: float | None = None
    token = re.compile(r"'id':\s*(-?\d+(?:\.\d+)?)|'type':\s*\[([^\]]*)\]")
    for m in token.finditer(src):
        if m.group(1) is not None:
            cur_id = float(m.group(1))
            continue
        if cur_id is None:
            continue
        if cur_id == int(cur_id) and 1 <= cur_id <= MAX_ID:
            iid = int(cur_id)
            names = re.findall(r"PokemonType\.(\w+)", m.group(2))
            idxs = [tidx[n] for n in names if n in tidx]  # drops None (-1)
            if iid not in by_id and idxs:
                by_id[iid] = idxs
        cur_id = None

    missing = [i for i in range(1, MAX_ID + 1) if i not in by_id]
    if missing:
        raise SystemExit(
            f"PokemonList.ts: missing types for {len(missing)} ids: "
            f"{missing[:10]}{' …' if len(missing) > 10 else ''}"
        )
    return [by_id[i] for i in range(1, MAX_ID + 1)]


def normalize_form_id(literal: str) -> str:
    """Key a fractional PokemonList.ts id the way JavaScript stringifies it.

    Saves hold the id as a JSON number, so the web app looks forms up with
    ``String(entry.id)``. Python's ``repr(float)`` and JS ``Number#toString``
    both emit the shortest round-tripping decimal, so ``'25.10'`` → ``'25.1'``
    on both sides. Integer ids are not forms and raise ``ValueError``.
    """
    value = float(literal)  # ValueError on garbage / empty
    if value.is_integer():
        raise ValueError(f"not a form id (integer): {literal!r}")
    return repr(value)


_ENTRY_START = re.compile(r"'id':\s*(-?\d+(?:\.\d+)?)\s*,")
_ENTRY_NAME = re.compile(r"'name':\s*'((?:[^'\\]|\\.)*)'")
_ENTRY_REGION = re.compile(r"'nativeRegion':\s*Region\.(\w+)")
_ENTRY_TYPE = re.compile(r"'type':\s*\[([^\]]*)\]")


def parse_pokemon_forms(src: str) -> dict[str, dict]:
    """Parse every fractional-id entry of PokemonList.ts into a lookup table.

    Returns ``{normalized_id: {"name", "types"[, "region"]}}``. ``region`` is
    set only when ``nativeRegion`` names one of ``REGION_RANGES`` (e.g. Alolan
    forms → ``'Alola'``); for anything else (Hisui, none) the web app falls
    back to the base species' dex region. ``PokemonType.None`` is dropped.
    Duplicate ids or entries missing a name/type abort the run.
    """
    tidx = {name: i for i, name in enumerate(POKEMON_TYPE_ORDER)}
    region_by_enum = {lbl.lower(): lbl for lbl, _lo, _hi in REGION_RANGES}
    starts = list(_ENTRY_START.finditer(src))
    forms: dict[str, dict] = {}
    for n, m in enumerate(starts):
        try:
            key = normalize_form_id(m.group(1))
        except ValueError:
            continue  # base species
        end = starts[n + 1].start() if n + 1 < len(starts) else len(src)
        chunk = src[m.end():end]
        name_m = _ENTRY_NAME.search(chunk)
        type_m = _ENTRY_TYPE.search(chunk)
        if not name_m or not type_m:
            raise SystemExit(f"PokemonList.ts: form {key} lacks a name or type")
        if key in forms:
            raise SystemExit(f"PokemonList.ts: duplicate form id {key}")
        names = re.findall(r"PokemonType\.(\w+)", type_m.group(1))
        entry: dict = {
            "name": name_m.group(1).replace("\\'", "'"),
            "types": [tidx[t] for t in names if t in tidx],
        }
        region_m = _ENTRY_REGION.search(chunk)
        if region_m and region_m.group(1) in region_by_enum:
            entry["region"] = region_by_enum[region_m.group(1)]
        forms[key] = entry
    return forms


def fetch_pokemon_forms(*, retries: int = 3) -> dict[str, dict]:
    """Pull PokemonList.ts and return the form table (see ``parse_pokemon_forms``)."""
    src = _fetch_with_retry(POKEMON_LIST_URL, label="PokemonList.ts",
                            retries=retries)
    forms = parse_pokemon_forms(src)
    if len(forms) < EXPECTED_FORMS_MIN:
        raise SystemExit(
            f"PokemonList.ts: expected >= {EXPECTED_FORMS_MIN} forms, got {len(forms)}"
        )
    return forms


def parse_egg_items(game_constants_src: str) -> list[str]:
    """``EggItemType`` member names = the ``player._itemList`` keys for egg items."""
    return _parse_enum_idents(game_constants_src, "EggItemType")


def parse_evolution_items(game_constants_src: str) -> list[str]:
    """``StoneType`` member names (``None`` sentinel dropped) = evolution-item keys."""
    return _parse_enum_idents(game_constants_src, "StoneType")


_MEGA_STONE_ITEM = re.compile(
    r"new\s+MegaStoneItem\(\s*MegaStoneType\.(\w+)\s*,\s*'((?:[^'\\]|\\.)*)'"
)


def parse_mega_stones(game_constants_src: str, item_list_src: str) -> list[dict]:
    """Join ``MegaStoneType`` (order, key) with ``ItemList.ts`` (base pokémon).

    Returns ``[{"stone": "Alakazite", "base": "Alakazam"}, …]`` in enum order.
    A stone with no ``MegaStoneItem`` entry aborts the run.
    """
    base_by_stone = {
        stone: base.replace("\\'", "'")
        for stone, base in _MEGA_STONE_ITEM.findall(item_list_src)
    }
    out: list[dict] = []
    for stone in _parse_enum_idents(game_constants_src, "MegaStoneType"):
        if stone not in base_by_stone:
            raise SystemExit(f"ItemList.ts: no MegaStoneItem for {stone}")
        out.append({"stone": stone, "base": base_by_stone[stone]})
    return out


def fetch_item_rosters(*, retries: int = 3) -> tuple[list[str], list[str], list[dict]]:
    """Fetch GameConstants.ts + ItemList.ts; return (eggs, evolution items, mega stones)."""
    consts = _fetch_with_retry(GAME_CONSTANTS_URL, label="GameConstants.ts",
                               retries=retries)
    items = _fetch_with_retry(ITEM_LIST_URL, label="ItemList.ts", retries=retries)
    eggs = parse_egg_items(consts)
    evolution = parse_evolution_items(consts)
    megas = parse_mega_stones(consts, items)
    if len(eggs) != EXPECTED_EGG_ITEM_COUNT:
        raise SystemExit(f"expected {EXPECTED_EGG_ITEM_COUNT} egg items, got {eggs!r}")
    if len(evolution) < EXPECTED_EVOLUTION_ITEMS_MIN:
        raise SystemExit(f"expected >= {EXPECTED_EVOLUTION_ITEMS_MIN} evolution items, got {len(evolution)}")
    if len(megas) < EXPECTED_MEGA_STONES_MIN:
        raise SystemExit(f"expected >= {EXPECTED_MEGA_STONES_MIN} mega stones, got {len(megas)}")
    return eggs, evolution, megas


# --- output writer ----------------------------------------------------------

def _dump(name: str, obj) -> Path:
    """Pretty-print ``obj`` as JSON to ``data/<name>``; return the path."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / name
    path.write_text(
        json.dumps(obj, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def write_data_files(names: list[str], buckets: list[int],
                     berries: list[str], mulches: list[str],
                     types: list[list[int]],
                     forms: dict[str, dict],
                     egg_items: list[str], evolution_items: list[str],
                     mega_stones: list[dict]) -> list[Path]:
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
        _dump("pokemon-forms.json", forms),
        _dump("egg-items.json", egg_items),
        _dump("evolution-items.json", evolution_items),
        _dump("mega-stones.json", mega_stones),
    ]
    return written


# --- main --------------------------------------------------------------------

def main() -> int:
    print(f"Fetching {MAX_ID} species from PokeAPI...")
    print(f"  cache: {CACHE_DIR.relative_to(REPO_ROOT)}")

    names: list[str] = []
    buckets: list[int] = []
    for pid in range(1, MAX_ID + 1):
        species = fetch_species(pid)
        names.append(display_name(species, pid))
        buckets.append(gender_bucket_index(species["gender_rate"]))
        if pid % 50 == 0 or pid == MAX_ID:
            print(f"  {pid:4d}/{MAX_ID}  {names[-1]}")

    print(f"\nFetching BerryType + MulchType enums from PokeClicker source...")
    berries = fetch_berry_names()
    print(f"  {len(berries)} berries: {berries[0]} ... {berries[-1]}")
    mulches = fetch_mulch_names()
    print(f"  {len(mulches)} mulches: {', '.join(mulches)}")
    types = fetch_pokemon_types()
    print(f"  {len(types)} pokemon type lists parsed")
    forms = fetch_pokemon_forms()
    print(f"  {len(forms)} pokemon forms parsed")

    egg_items, evolution_items, mega_stones = fetch_item_rosters()
    print(f"  {len(egg_items)} egg items, {len(evolution_items)} evolution items, "
          f"{len(mega_stones)} mega stones")

    written = write_data_files(names, buckets, berries, mulches, types, forms,
                               egg_items, evolution_items, mega_stones)
    print(f"\nWrote {len(written)} files to {DATA_DIR.relative_to(REPO_ROOT)}/:")
    for path in written:
        print(f"  {path.name}  ({path.stat().st_size} bytes)")
    return 0


try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

if __name__ == "__main__":
    sys.exit(main())
