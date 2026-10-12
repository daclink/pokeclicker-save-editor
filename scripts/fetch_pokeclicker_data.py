#!/usr/bin/env python3
"""Fetch reference data and (re)generate ``pokeclicker_data.py``.

Two upstream sources, both stdlib-only:

1. **PokeAPI** (``https://pokeapi.co``) — display names and gender rates for
   the 1025-entry national dex. Each species response is cached under
   ``.cache/pokeapi/<id>.json`` so re-runs are instant. The cache directory
   is gitignored (covered by the existing ``.cache`` rule).

2. **PokeClicker source** (``BerryType.ts``, ``PokemonList.ts``, … on GitHub)
   — fetched from the tagged release ``v{GAME_VERSION}`` (``PC_REF``), not the
   ``develop`` branch, so the data never describes content the released game
   lacks. ``--game-ref develop`` previews an unreleased tree. The run writes
   ``data/manifest.json`` recording the game version and ref it came from.

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

import argparse
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

# PokeClicker release this editor targets. Data is fetched from its git tag;
# bump this (and regenerate) when moving the editor to a new game release.
GAME_VERSION = "0.10.26"
# Upstream tags releases as `v<version>` (refs/tags/v0.10.26).
PC_REF = f"v{GAME_VERSION}"
PC_REPO_RAW = "https://raw.githubusercontent.com/pokeclicker/pokeclicker"


def pc_raw(ref: str) -> str:
    """Raw-file base URL for a PokeClicker git ref (tag or branch)."""
    return f"{PC_REPO_RAW}/{ref}"


PC_RAW = pc_raw(PC_REF)


def pc_url(path: str, ref: str = PC_REF) -> str:
    """Raw URL of ``path`` (repo-relative) in the PokeClicker repo at ``ref``."""
    return f"{pc_raw(ref)}/{path}"


# Repo-relative source paths (joined to a ref by ``pc_url``).
PACKAGE_JSON_PATH = "package.json"
BERRY_TYPE_PATH = "src/modules/enums/BerryType.ts"
MULCH_TYPE_PATH = "src/modules/enums/MulchType.ts"
POKEMON_TYPE_PATH = "src/modules/enums/PokemonType.ts"
POKEMON_LIST_PATH = "src/modules/pokemons/PokemonList.ts"
GAME_CONSTANTS_PATH = "src/modules/GameConstants.ts"
ITEM_LIST_PATH = "src/modules/items/ItemList.ts"

# data/manifest.json — which game build the whole data/ directory describes.
MANIFEST_FILE = "manifest.json"
MANIFEST_VERSION_KEY = "gameVersion"
MANIFEST_REF_KEY = "gameRef"

# TypeScript enums' ``None = -1`` sentinel member (dropped by the parsers).
ENUM_NONE_MEMBER = "None"
# PokemonType.ts: Normal = 0 … Fairy = 17, plus the None sentinel.
EXPECTED_POKEMON_TYPE_COUNT = 18

# Species whose types pin the PokemonType index mapping and the per-entry
# parse (PokemonList.ts): Bulbasaur is Grass/Poison, Pikachu Electric.
POKEMON_TYPE_SENTINELS: dict[int, list[str]] = {
    1: ["Grass", "Poison"],
    25: ["Electric"],
}
# A form whose name pins the per-entry form parse (PokemonList.ts, id 25.01).
FORM_SENTINEL_ID = "25.01"
FORM_SENTINEL_NAME = "Pikachu (Original Cap)"

EXPECTED_BERRY_COUNT = 70
EXPECTED_FIRST_BERRY = "Cheri"
EXPECTED_LAST_BERRY = "Hopo"
# MulchType.ts members (Boost … Gooey). Saves' mulchList may carry an extra
# slot; the editors label that generically, so the enum itself is exact.
EXPECTED_MULCH_COUNT = 6
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
    r"^\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*(?:=\s*(-?\d+)\s*)?,?\s*$"
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


def _parse_enum_members(src: str, enum_name: str) -> list[tuple[str, int]]:
    """Return ``(identifier, value)`` pairs in declaration order from
    ``enum <name> { ... }``, including the ``None = -1`` sentinel.

    Comments (``//`` and ``/* */``, e.g. ``// Fourth Generation (Typed)``)
    are stripped first; every remaining non-blank line must be exactly one
    member, optionally quoted, with an optional ``= <int>`` and trailing
    comma. Anything else aborts the run: a skipped or merged member would
    silently shift every later index. Values follow TypeScript numbering
    (an implicit member is the previous value + 1, starting at 0).
    """
    clean = strip_comments(src)
    m = re.search(r"enum\s+" + re.escape(enum_name) + r"\s*\{(.*?)\}",
                  clean, re.DOTALL)
    if not m:
        raise SystemExit(f"could not locate `enum {enum_name} {{ ... }}` in source")
    body = m.group(1)

    members: list[tuple[str, int]] = []
    next_value = 0
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        match = _ENUM_LINE.match(line)
        if not match:
            raise SystemExit(f"{enum_name}: unrecognized enum line: {raw!r}")
        value = int(match.group(3)) if match.group(3) is not None else next_value
        members.append((match.group(2), value))
        next_value = value + 1
    return members


def _parse_enum_idents(src: str, enum_name: str) -> list[str]:
    """Identifiers of ``enum <name>`` in declaration order, ``None`` dropped
    (strict — see ``_parse_enum_members``)."""
    return [ident for ident, _value in _parse_enum_members(src, enum_name)
            if ident != ENUM_NONE_MEMBER]


def parse_pokemon_type_names(src: str) -> list[str]:
    """``PokemonType`` member names indexed by enum value (0 Normal … 17 Fairy).

    Aborts unless, after dropping ``None = -1``, the values are exactly
    ``0 .. EXPECTED_POKEMON_TYPE_COUNT - 1`` in declaration order — this list
    is the index space for ``pokemon-types.json`` and the gem wallet.
    """
    members = [(n, v) for n, v in _parse_enum_members(src, "PokemonType")
               if n != ENUM_NONE_MEMBER]
    values = [v for _n, v in members]
    if values != list(range(EXPECTED_POKEMON_TYPE_COUNT)):
        raise SystemExit(
            f"PokemonType.ts: expected values 0..{EXPECTED_POKEMON_TYPE_COUNT - 1} "
            f"in order, got {members!r}"
        )
    return [n for n, _v in members]


def fetch_pokemon_type_names(*, ref: str = PC_REF, retries: int = 3) -> list[str]:
    """Pull PokemonType.ts at ``ref`` and parse it (see ``parse_pokemon_type_names``)."""
    src = _fetch_with_retry(pc_url(POKEMON_TYPE_PATH, ref), label="PokemonType.ts",
                            retries=retries)
    return parse_pokemon_type_names(src)


def fetch_berry_names(*, ref: str = PC_REF, retries: int = 3) -> list[str]:
    """Pull BerryType.ts from the PokeClicker repo and parse out the 70 names.

    Hard-asserts length 70, first == 'Cheri', last == 'Hopo' — the cheapest
    defense against an upstream rename or section reorder.
    """
    src = _fetch_with_retry(pc_url(BERRY_TYPE_PATH, ref), label="BerryType.ts",
                            retries=retries)
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


def fetch_mulch_names(*, ref: str = PC_REF, retries: int = 3) -> list[str]:
    """Pull MulchType.ts and return display names (``Boost_Mulch`` -> ``Boost``).

    Hard-asserts exactly ``EXPECTED_MULCH_COUNT`` entries. Real saves often
    carry one more slot in ``mulchList`` than the enum names; the GUI
    handles that by labeling extra slots generically.
    """
    src = _fetch_with_retry(pc_url(MULCH_TYPE_PATH, ref), label="MulchType.ts",
                            retries=retries)
    raw = _parse_enum_idents(src, "MulchType")
    if len(raw) != EXPECTED_MULCH_COUNT:
        raise SystemExit(
            f"expected {EXPECTED_MULCH_COUNT} mulch entries, "
            f"got {len(raw)}: {raw!r}"
        )
    # 'Boost_Mulch' -> 'Boost'; if a future entry doesn't end with '_Mulch',
    # fall back to the raw identifier.
    return [n[:-len("_Mulch")] if n.endswith("_Mulch") else n for n in raw]


def _type_indexes(type_list_src: str, type_names: list[str], where: str) -> list[int]:
    """``PokemonType.A, PokemonType.B`` → enum indexes; ``None`` is dropped and
    an unknown member name aborts (it would otherwise vanish silently)."""
    tidx = {name: i for i, name in enumerate(type_names)}
    out: list[int] = []
    for name in re.findall(r"PokemonType\.(\w+)", type_list_src):
        if name == ENUM_NONE_MEMBER:
            continue
        if name not in tidx:
            raise SystemExit(f"PokemonList.ts: {where} has unknown type {name!r}")
        out.append(tidx[name])
    return out


def parse_pokemon_types(src: str, type_names: list[str]) -> list[list[int]]:
    """Per-species type indexes from PokemonList.ts, dex id 1..MAX_ID.

    Parses each entry's own chunk (see ``_iter_entries``), which must hold
    exactly one ``'type': [...]`` list. Forms (fractional ids) and ids
    outside 1..MAX_ID are skipped. Returns a list of length MAX_ID where
    entry ``i`` is the type list for dex id ``i + 1``. A missing, duplicate
    or typeless species aborts the run.
    """
    by_id: dict[int, list[int]] = {}
    for literal, chunk in _iter_entries(src):
        type_list = _entry_type_list(chunk, literal)
        value = float(literal)
        if not value.is_integer() or not 1 <= value <= MAX_ID:
            continue
        iid = int(value)
        if iid in by_id:
            raise SystemExit(f"PokemonList.ts: duplicate species id {iid}")
        idxs = _type_indexes(type_list, type_names, f"#{iid}")
        if not idxs:
            raise SystemExit(f"PokemonList.ts: #{iid} has no types")
        by_id[iid] = idxs

    missing = [i for i in range(1, MAX_ID + 1) if i not in by_id]
    if missing:
        raise SystemExit(
            f"PokemonList.ts: missing types for {len(missing)} ids: "
            f"{missing[:10]}{' …' if len(missing) > 10 else ''}"
        )
    return [by_id[i] for i in range(1, MAX_ID + 1)]


def check_pokemon_type_sentinels(types: list[list[int]], type_names: list[str]) -> None:
    """Abort unless each ``POKEMON_TYPE_SENTINELS`` species has its known types."""
    for pid, expected in POKEMON_TYPE_SENTINELS.items():
        actual = [type_names[i] for i in types[pid - 1]]
        if actual != expected:
            raise SystemExit(
                f"PokemonList.ts: #{pid} should be {expected}, parsed {actual} — "
                "type parser or PokemonType order regressed"
            )


def fetch_pokemon_types(type_names: list[str], *, ref: str = PC_REF,
                        retries: int = 3) -> list[list[int]]:
    """Pull PokemonList.ts at ``ref``; return per-species type indexes
    (see ``parse_pokemon_types``), sentinel-checked."""
    src = _fetch_with_retry(pc_url(POKEMON_LIST_PATH, ref), label="PokemonList.ts",
                            retries=retries)
    types = parse_pokemon_types(src, type_names)
    check_pokemon_type_sentinels(types, type_names)
    return types


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
# The species' own type list. Nested objects also use a `'type'` key (e.g.
# `'gender': { 'type': Genders.Genderless }`) but never with an array value.
_ENTRY_TYPE = re.compile(r"'type':\s*\[([^\]]*)\]")
_ENTRY_OPEN = "{"


def _iter_entries(src: str):
    """Yield ``(id_literal, chunk)`` for every PokemonList.ts entry, where
    ``chunk`` runs from after ``'id': N,`` to the next entry's ``'id'``.

    Chunking from one ``'id'`` to the next is only right while ``'id'`` is
    each entry's first field, so that is enforced: anything but whitespace
    between the entry's opening ``{`` and ``'id'`` aborts the run (otherwise
    a field placed before ``'id'`` would be credited to the previous entry).
    """
    starts = list(_ENTRY_START.finditer(src))
    for n, m in enumerate(starts):
        open_idx = src.rfind(_ENTRY_OPEN, 0, m.start())
        if open_idx < 0 or src[open_idx + 1:m.start()].strip():
            raise SystemExit(
                f"PokemonList.ts: 'id': {m.group(1)} is not the first field of its "
                "entry — per-entry parsing assumes 'id' comes first"
            )
        end = starts[n + 1].start() if n + 1 < len(starts) else len(src)
        yield m.group(1), src[m.end():end]


def _entry_type_list(chunk: str, literal: str) -> str:
    """The single ``'type': [...]`` body in an entry chunk; zero or several abort."""
    found = _ENTRY_TYPE.findall(chunk)
    if len(found) != 1:
        raise SystemExit(
            f"PokemonList.ts: entry {literal} has {len(found)} 'type' lists, expected 1"
        )
    return found[0]


def parse_pokemon_forms(src: str, type_names: list[str]) -> dict[str, dict]:
    """Parse every fractional-id entry of PokemonList.ts into a lookup table.

    Returns ``{normalized_id: {"name", "types"[, "region"]}}``. ``region`` is
    set only when ``nativeRegion`` names one of ``REGION_RANGES`` (e.g. Alolan
    forms → ``'Alola'``); for anything else (Hisui, none) the web app falls
    back to the base species' dex region. ``PokemonType.None`` is dropped.
    Duplicate ids, entries missing a name or holding other than one type
    list, unknown type names, or an ``'id'`` that isn't its entry's first
    field abort the run.
    """
    region_by_enum = {lbl.lower(): lbl for lbl, _lo, _hi in REGION_RANGES}
    forms: dict[str, dict] = {}
    for literal, chunk in _iter_entries(src):
        try:
            key = normalize_form_id(literal)
        except ValueError:
            continue  # base species
        name_m = _ENTRY_NAME.search(chunk)
        if not name_m or not _ENTRY_TYPE.search(chunk):
            raise SystemExit(f"PokemonList.ts: form {key} lacks a name or type")
        if key in forms:
            raise SystemExit(f"PokemonList.ts: duplicate form id {key}")
        entry: dict = {
            "name": name_m.group(1).replace("\\'", "'"),
            "types": _type_indexes(_entry_type_list(chunk, literal), type_names,
                                   f"form {key}"),
        }
        region_m = _ENTRY_REGION.search(chunk)
        if region_m and region_m.group(1) in region_by_enum:
            entry["region"] = region_by_enum[region_m.group(1)]
        forms[key] = entry
    return forms


def check_form_sentinel(forms: dict[str, dict]) -> None:
    """Abort unless ``FORM_SENTINEL_ID`` parsed with ``FORM_SENTINEL_NAME`` —
    a field-order change upstream would shift names onto neighbours."""
    actual = forms.get(FORM_SENTINEL_ID, {}).get("name")
    if actual != FORM_SENTINEL_NAME:
        raise SystemExit(
            f"PokemonList.ts: form {FORM_SENTINEL_ID} should be "
            f"{FORM_SENTINEL_NAME!r}, parsed {actual!r} — form parser regressed"
        )


def fetch_pokemon_forms(type_names: list[str], *, ref: str = PC_REF,
                        retries: int = 3) -> dict[str, dict]:
    """Pull PokemonList.ts at ``ref`` and return the form table
    (see ``parse_pokemon_forms``), sentinel-checked."""
    src = _fetch_with_retry(pc_url(POKEMON_LIST_PATH, ref), label="PokemonList.ts",
                            retries=retries)
    forms = parse_pokemon_forms(src, type_names)
    if len(forms) < EXPECTED_FORMS_MIN:
        raise SystemExit(
            f"PokemonList.ts: expected >= {EXPECTED_FORMS_MIN} forms, got {len(forms)}"
        )
    check_form_sentinel(forms)
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


def fetch_item_rosters(*, ref: str = PC_REF,
                       retries: int = 3) -> tuple[list[str], list[str], list[dict]]:
    """Fetch GameConstants.ts + ItemList.ts; return (eggs, evolution items, mega stones)."""
    consts = _fetch_with_retry(pc_url(GAME_CONSTANTS_PATH, ref), label="GameConstants.ts",
                               retries=retries)
    items = _fetch_with_retry(pc_url(ITEM_LIST_PATH, ref), label="ItemList.ts",
                              retries=retries)
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


# --- underground items --------------------------------------------------------

UNDERGROUND_ITEMS_PATH = "src/modules/underground/UndergroundItems.ts"
UNDERGROUND_NAME_TYPE_PATH = "src/modules/underground/UndergroundItemNameType.ts"
EXPECTED_UNDERGROUND_ITEMS_MIN = 70  # 81 at v0.10.26

# Plain ``UndergroundItem`` without an explicit ``UndergroundItemValueType``
# argument is a Diamond treasure (constructor default).
UNDERGROUND_DEFAULT_VALUE_TYPE = "Diamond"
UNDERGROUND_CLASS_VALUE_TYPE = {
    "UndergroundItem": None,  # default, or the explicit valueType argument
    "UndergroundGemItem": "Gem",
    "UndergroundFossilPieceItem": "FossilPiece",
    "UndergroundEvolutionItem": "EvolutionItem",
    "UndergroundShardItem": "Shard",
    "UndergroundMegaStoneItem": "MegaStone",
}

_UNDERGROUND_ADD_RE = re.compile(r"UndergroundItems\.addItem\(")
# ``new <Class>(`` then, for mega stones only, a leading ``MegaStoneType.X,``;
# then the numeric id and the quoted ``_itemList`` key.
_UNDERGROUND_ITEM_RE = re.compile(
    r"\s*new\s+(?P<cls>\w+)\(\s*(?:MegaStoneType\.\w+\s*,\s*)?"
    r"(?P<id>\d+)\s*,\s*'(?P<key>\w+)'"
)
_UNDERGROUND_VALUE_TYPE_RE = re.compile(r"UndergroundItemValueType\.(\w+)")
_NAME_TYPE_MEMBER_RE = re.compile(r"[=|]\s*'((?:[^'\\]|\\.)*)'")


def parse_underground_items(src: str) -> list[dict]:
    """Every live ``UndergroundItems.addItem(new …)`` as
    ``{"id", "key", "valueType"}`` in file order. Commented-out lines are
    ignored; an addItem call or item class this parser doesn't know aborts."""
    clean = strip_comments(src)
    items: list[dict] = []
    for m in _UNDERGROUND_ADD_RE.finditer(clean):
        open_idx = m.end() - 1
        call = clean[open_idx + 1:_find_close(clean, open_idx)]
        item = _UNDERGROUND_ITEM_RE.match(call)
        if not item:
            raise SystemExit(f"UndergroundItems.ts: can't parse addItem({call[:80]!r}…)")
        cls = item.group("cls")
        if cls not in UNDERGROUND_CLASS_VALUE_TYPE:
            raise SystemExit(f"UndergroundItems.ts: unknown item class {cls}")
        value_type = UNDERGROUND_CLASS_VALUE_TYPE[cls]
        if value_type is None:
            explicit = _UNDERGROUND_VALUE_TYPE_RE.search(call)
            value_type = explicit.group(1) if explicit else UNDERGROUND_DEFAULT_VALUE_TYPE
        items.append({"id": int(item.group("id")), "key": item.group("key"),
                      "valueType": value_type})
    return items


def _underground_name_key(name: str) -> str:
    """``'Rare Bone'`` and ``'Rare_bone'`` compare equal."""
    return name.replace("_", " ").lower()


def check_underground_items(items: list[dict], name_type_src: str) -> None:
    """Abort unless ids are unique and every name in
    ``UndergroundItemNameType`` was parsed. That type is regenerated by hand
    in the game repo and lags new items, so extra parsed items are fine; a
    listed name the parser missed means the parser broke."""
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit(f"UndergroundItems.ts: duplicate ids in {ids}")
    parsed = {_underground_name_key(i["key"]) for i in items}
    names = _NAME_TYPE_MEMBER_RE.findall(strip_comments(name_type_src))
    missed = [n for n in names if _underground_name_key(n) not in parsed]
    if missed:
        raise SystemExit(f"UndergroundItems.ts parser missed {missed}")


def fetch_underground_items(*, ref: str = PC_REF, retries: int = 3) -> list[dict]:
    src = _fetch_with_retry(pc_url(UNDERGROUND_ITEMS_PATH, ref),
                            label="UndergroundItems.ts", retries=retries)
    name_type = _fetch_with_retry(pc_url(UNDERGROUND_NAME_TYPE_PATH, ref),
                                  label="UndergroundItemNameType.ts", retries=retries)
    items = parse_underground_items(src)
    check_underground_items(items, name_type)
    if len(items) < EXPECTED_UNDERGROUND_ITEMS_MIN:
        raise SystemExit(f"expected >= {EXPECTED_UNDERGROUND_ITEMS_MIN} underground items, got {len(items)}")
    return items


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

# --- quest-line step parser --------------------------------------------------

QUEST_LINE_HELPER_PATH = "src/scripts/quests/QuestLineHelper.ts"
GAME_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
QUEST_STEPS_VERSION_KEY = "gameVersion"
QUEST_STEPS_LINES_KEY = "lines"

# Tokens found by one forward pass over the source, in file order:
#   - a `const x = new QuestLine('Name', ...)` declaration
#   - a `const x = new SomeQuestType(` step-variable declaration
#   - an `x.addQuest(` call (its argument is classified separately)
# Because addQuest calls always name their questline variable explicitly, a
# flat var->meta dict built strictly in file order resolves steps correctly even
# when different methods reuse local names (`step1`).
_QUEST_TOKEN_RE = re.compile(
    r"(?:const|let)\s+(?P<qlvar>\w+)\s*=\s*new\s+QuestLine\(\s*'(?P<qlname>(?:\\'|[^'])*)'"
    r"|(?:const|let)\s+(?P<stepvar>\w+)\s*=\s*new\s+(?P<stepclass>\w+)\s*\("
    r"|(?P<addvar>\w+)\.addQuest\("
)

# What follows `.addQuest(`: an inline `new Cls(`, a bare variable `v)`, or a
# call expression `fn(` that returns a quest.
_ADD_ARG_NEW_RE = re.compile(r"\s*new\s+(?P<cls>\w+)\s*\(")
_ADD_ARG_VAR_RE = re.compile(r"\s*(?P<var>\w+)\s*\)")
_ADD_ARG_CALL_RE = re.compile(r"\s*(?:this\.)?(?P<fn>\w+)\(")

# Arrow-function definitions: `[const|let|public static] name = (params)[: T] => {`
_ARROW_DEF_RE = re.compile(
    r"(?:(?:const|let)|public\s+static)\s+(?P<name>\w+)\s*=\s*\("
)
_ARROW_TAIL_RE = re.compile(r"\s*(?::[^={]+)?=>\s*\{")
_RETURN_VAR_RE = re.compile(r"\breturn\s+(?P<var>\w+)\s*;")
_RETURN_NEW_RE = re.compile(r"\breturn\s+new\s+(?P<cls>\w+)\(")

# Matched starting right after "new CustomQuest(" — captures the constructor
# args when the focus reads a player.itemList key (the only CustomQuest shape
# this tool can verify progress for).
# Accepted focus forms: `() => player.itemList.X()`, a bare observable
# `player.itemList.X`, or `player.itemList.X()`. The reward may be a number or
# `undefined` (e.g. the Lair of Giants Wishing Piece steps).
_CUSTOM_QUEST_ITEMLIST_RE = re.compile(
    r"\s*(?P<amount>\d+)\s*,\s*(?:-?\d+|undefined)\s*,\s*'(?:\\'|[^'])*'"
    r"\s*,\s*(?:\(\)\s*=>\s*)?player\.itemList\.(?P<itemkey>\w+)(?:\(\))?\s*\)"
)

CUSTOM_QUEST_CLASS = "CustomQuest"
EXPECTED_MIN_QUEST_LINES = 30
SANITY_QUEST_LINE = "Zero's Ambition"
SANITY_STEP_INDEX = 4
SANITY_STEP = {"type": CUSTOM_QUEST_CLASS, "itemKey": "Purple_shard", "amount": 10}

_OPEN_TO_CLOSE = {"(": ")", "[": "]", "{": "}"}
_QUOTES = "'\""
_TEMPLATE_QUOTE = "`"


def _find_close(src: str, open_idx: int) -> int:
    """Index of the bracket closing the one at ``open_idx``.

    Skips string/template literals and comments so brackets inside them (and
    apostrophes in comments) are ignored. Raises ValueError if unbalanced.
    """
    stack: list[str] = []
    i = open_idx
    n = len(src)
    while i < n:
        c = src[i]
        if c in _QUOTES:
            i += 1
            while i < n and src[i] != c:
                i += 2 if src[i] == "\\" else 1
        elif c == _TEMPLATE_QUOTE:
            i += 1
            while i < n and src[i] != _TEMPLATE_QUOTE:
                if src[i] == "\\":
                    i += 2
                elif src.startswith("${", i):
                    i = _find_close(src, i + 1)
                    i += 1
                else:
                    i += 1
        elif src.startswith("//", i):
            nl = src.find("\n", i)
            i = n if nl < 0 else nl
        elif src.startswith("/*", i):
            end = src.find("*/", i + 2)
            i = n if end < 0 else end + 1
        elif c in _OPEN_TO_CLOSE:
            stack.append(_OPEN_TO_CLOSE[c])
        elif c in ")]}":
            if not stack or stack.pop() != c:
                raise ValueError(f"unbalanced bracket at offset {i}")
            if not stack:
                return i
        i += 1
    raise ValueError(f"no closing bracket for offset {open_idx}")


def _split_top_level(text: str) -> list[str]:
    """Split ``text`` on commas that are not nested in brackets or literals."""
    parts: list[str] = []
    depth_start = 0
    i = 0
    while i < len(text):
        c = text[i]
        if c in _OPEN_TO_CLOSE:
            i = _find_close(text, i)
        elif c in _QUOTES or c == _TEMPLATE_QUOTE:
            i = _skip_literal(text, i)
        elif c == ",":
            parts.append(text[depth_start:i])
            depth_start = i + 1
        i += 1
    tail = text[depth_start:]
    if tail.strip():
        parts.append(tail)
    return [p.strip() for p in parts]


def _skip_literal(text: str, i: int) -> int:
    """Index of the closing quote of the string/template literal at ``i``."""
    quote = text[i]
    i += 1
    while i < len(text) and text[i] != quote:
        i += 2 if text[i] == "\\" else 1
    return i


def strip_comments(src: str) -> str:
    """Blank out `//` and `/* */` comments with spaces (newlines kept) so
    offsets are unchanged. String and template literals are left intact."""
    out = list(src)
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c in _QUOTES:
            i = _skip_literal(src, i)
        elif c == _TEMPLATE_QUOTE:
            i += 1
            while i < n and src[i] != _TEMPLATE_QUOTE:
                if src[i] == "\\":
                    i += 2
                elif src.startswith("${", i):
                    i = _find_close(src, i + 1) + 1
                else:
                    i += 1
        elif src.startswith("//", i) or src.startswith("/*", i):
            if src.startswith("//", i):
                nl = src.find("\n", i)
                end = n if nl < 0 else nl
            else:
                close = src.find("*/", i + 2)
                end = n if close < 0 else close + 2
            for j in range(i, end):
                if out[j] != "\n":
                    out[j] = " "
            i = end - 1
        i += 1
    return "".join(out)


def _custom_quest_meta(src: str, after_ctor: int) -> dict:
    am = _CUSTOM_QUEST_ITEMLIST_RE.match(src, after_ctor)
    if am:
        return {
            "type": CUSTOM_QUEST_CLASS,
            "itemKey": am.group("itemkey"),
            "amount": int(am.group("amount")),
        }
    return {"type": CUSTOM_QUEST_CLASS}


def _step_meta(cls: str, src: str, after_ctor: int) -> dict:
    if cls == CUSTOM_QUEST_CLASS:
        return _custom_quest_meta(src, after_ctor)
    return {"type": cls}


class _Closure:
    """A local arrow function whose body contains addQuest calls (a template
    of steps replayed at each call site) and/or returns a quest."""

    def __init__(self, params: list[str], body_start: int, body_end: int) -> None:
        self.params = params
        self.body_start = body_start
        self.body_end = body_end
        # (receiver variable name, step meta) in body order
        self.template: list[tuple[str, dict]] = []
        self.returned: dict | None = None


def _find_closures(src: str) -> dict[str, _Closure]:
    closures: dict[str, _Closure] = {}
    for m in _ARROW_DEF_RE.finditer(src):
        try:
            params_end = _find_close(src, m.end() - 1)
        except ValueError:
            continue
        tail = _ARROW_TAIL_RE.match(src, params_end + 1)
        if not tail:
            continue
        body_open = tail.end() - 1
        body_end = _find_close(src, body_open)
        params = []
        for p in _split_top_level(src[m.end():params_end]):
            pm = re.match(r"\w+", p)
            if pm:
                params.append(pm.group(0))
        closures[m.group("name")] = _Closure(params, body_open, body_end)
    return closures


def _parse_quest_lines(src: str) -> tuple[dict[str, list[dict]], int]:
    ql_var_to_name: dict[str, str] = {}
    ql_steps: dict[str, list[dict]] = {}
    step_var_to_meta: dict[str, dict] = {}
    closures = _find_closures(src)

    def owner_of(pos: int) -> str | None:
        for name, c in closures.items():
            if c.body_start < pos < c.body_end:
                return name
        return None

    # Closure calls, found by position so they merge with the token stream.
    call_re = (re.compile(r"(?<![\w.])(?:this\.)?(?P<fn>%s)\(" % "|".join(
        map(re.escape, closures))) if closures else None)
    events: list[tuple[int, str, re.Match]] = [
        (m.start(), "tok", m) for m in _QUEST_TOKEN_RE.finditer(src)
    ]
    if call_re:
        events += [(m.start(), "call", m) for m in call_re.finditer(src)]
    events.sort(key=lambda e: e[0])

    sites = 0
    skip_until = -1
    for pos, kind, m in events:
        if pos < skip_until:  # nested inside an already-consumed addQuest arg
            continue
        scope = owner_of(pos)
        if kind == "call":
            clo = closures[m.group("fn")]
            if not clo.template:
                continue  # returns a quest / adds nothing; used as an argument
            open_idx = m.end() - 1
            args = _split_top_level(src[open_idx + 1:_find_close(src, open_idx)])
            for recv, meta in clo.template:
                if recv in clo.params:
                    idx = clo.params.index(recv)
                    recv = args[idx] if idx < len(args) else ""
                qlname = ql_var_to_name.get(recv)
                if qlname is None:
                    raise ValueError(f"closure call {m.group('fn')!r} adds to "
                                     f"unknown quest line {recv!r}")
                ql_steps[qlname].append(meta)
            continue

        if m.group("qlvar"):
            name = m.group("qlname").replace("\\'", "'")
            ql_var_to_name[m.group("qlvar")] = name
            ql_steps.setdefault(name, [])
        elif m.group("stepvar"):
            step_var_to_meta[m.group("stepvar")] = _step_meta(
                m.group("stepclass"), src, m.end())
        else:  # addQuest call
            sites += 1
            meta = _classify_add_arg(src, m.end(), step_var_to_meta, closures)
            recv = m.group("addvar")
            if scope is not None:
                closures[scope].template.append((recv, meta))
            else:
                qlname = ql_var_to_name.get(recv)
                if qlname is None:
                    raise ValueError(f"addQuest on unknown quest line {recv!r}")
                ql_steps[qlname].append(meta)
            skip_until = _find_close(src, m.end() - 1)

    return ql_steps, sites


def _classify_add_arg(src: str, arg_start: int, step_vars: dict[str, dict],
                      closures: dict[str, _Closure]) -> dict:
    m = _ADD_ARG_NEW_RE.match(src, arg_start)
    if m:
        return _step_meta(m.group("cls"), src, m.end())
    m = _ADD_ARG_VAR_RE.match(src, arg_start)
    if m:
        meta = step_vars.get(m.group("var"))
        if meta is None:
            raise ValueError(f"addQuest argument {m.group('var')!r} is not a "
                             "known quest variable")
        return meta
    m = _ADD_ARG_CALL_RE.match(src, arg_start)
    if m and m.group("fn") in closures:
        clo = closures[m.group("fn")]
        body = src[clo.body_start:clo.body_end]
        rv = _RETURN_VAR_RE.search(body)
        if rv and rv.group("var") in step_vars:
            return step_vars[rv.group("var")]
        rn = _RETURN_NEW_RE.search(body)
        if rn:
            return {"type": rn.group("cls")}
    raise ValueError("unrecognised addQuest argument at: "
                     + src[arg_start:arg_start + 80].replace("\n", " "))


def parse_quest_line_steps(src: str, *, with_site_count: bool = False):
    """Parse `QuestLineHelper.ts` source into {questline name: [step, ...]}.

    Each step is `{"type": ClassName}`, or for a `CustomQuest` whose focus
    reads `player.itemList.<Key>()`, `{"type": "CustomQuest", "itemKey":
    <Key>, "amount": <int>}`. Handles `x.addQuest(stepVar)`, inline
    `x.addQuest(new Cls(...))` (quests nested in that call's arguments are not
    separate steps), `x.addQuest(fn(...))` where fn returns a quest, and local
    arrow functions that call addQuest (replayed per call, in call order,
    binding a quest-line parameter to the argument passed). Anything else
    raises ValueError rather than guessing.

    With ``with_site_count=True`` returns ``(steps, addQuest_sites_handled)``
    for use with `check_step_count`.
    """
    steps, sites = _parse_quest_lines(strip_comments(src))
    return (steps, sites) if with_site_count else steps


ADD_QUEST_CALL = ".addQuest("


def check_step_count(sites_handled: int, src: str) -> None:
    """Fail loudly unless every `.addQuest(` occurrence in ``src`` was handled
    by the parser exactly once (closure bodies count once, however many times
    they are called)."""
    expected = strip_comments(src).count(ADD_QUEST_CALL)
    if sites_handled != expected:
        raise SystemExit(
            f"QuestLineHelper.ts parser handled {sites_handled} addQuest calls "
            f"but the source contains {expected} — an unhandled shape would "
            "shift step indices"
        )


def parse_game_version(package_json_text: str) -> str:
    """Read the `version` field (X.Y.Z) out of PokeClicker's package.json."""
    try:
        version = json.loads(package_json_text).get("version")
    except (ValueError, AttributeError) as e:
        raise SystemExit(f"package.json is not valid JSON: {e}")
    if not isinstance(version, str) or not GAME_VERSION_RE.match(version):
        raise SystemExit(f"package.json has no X.Y.Z version (got {version!r})")
    return version


def check_game_version(version: str, ref: str) -> str:
    """Return ``version``; abort if the default (pinned) ref reports anything
    but ``GAME_VERSION`` — a mis-tagged or wrong ref must not ship as the
    targeted release. An explicit ``--game-ref`` override accepts any version."""
    if ref == PC_REF and version != GAME_VERSION:
        raise SystemExit(
            f"package.json at {ref} says {version}, expected {GAME_VERSION} — "
            "fix GAME_VERSION or the ref"
        )
    return version


def fetch_game_version(*, ref: str = PC_REF, retries: int = 3) -> str:
    """Game version (package.json) at ``ref``, checked by ``check_game_version``."""
    text = _fetch_with_retry(pc_url(PACKAGE_JSON_PATH, ref), label="package.json",
                             retries=retries)
    return check_game_version(parse_game_version(text), ref)


def build_manifest(game_version: str, game_ref: str) -> dict:
    """The on-disk shape of data/manifest.json."""
    return {MANIFEST_VERSION_KEY: game_version, MANIFEST_REF_KEY: game_ref}


def build_quest_steps_payload(game_version: str,
                              lines: dict[str, list[dict]]) -> dict:
    """The on-disk shape of data/quest-steps.json."""
    return {QUEST_STEPS_VERSION_KEY: game_version, QUEST_STEPS_LINES_KEY: lines}


def fetch_quest_line_steps(*, ref: str = PC_REF,
                           retries: int = 3) -> dict[str, list[dict]]:
    """Pull QuestLineHelper.ts from the PokeClicker repo and parse it.

    Hard-asserts the exact shape of the bug diagnosed in this repo's
    2026-07-28 session (Zero's Ambition step 4 = Purple Shards) as the
    cheapest defense against an upstream restructure silently breaking the
    parser.
    """
    src = _fetch_with_retry(pc_url(QUEST_LINE_HELPER_PATH, ref),
                            label="QuestLineHelper.ts", retries=retries)
    try:
        steps, sites = parse_quest_line_steps(src, with_site_count=True)
    except ValueError as e:
        raise SystemExit(f"QuestLineHelper.ts parse failed: {e}")
    check_step_count(sites, src)

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



def write_data_files(names: list[str], buckets: list[int],
                     berries: list[str], mulches: list[str],
                     types: list[list[int]],
                     forms: dict[str, dict],
                     egg_items: list[str], evolution_items: list[str],
                     mega_stones: list[dict],
                     quest_steps: dict,
                     underground_items: list[dict],
                     type_names: list[str],
                     manifest: dict,
                     ) -> list[Path]:
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
        _dump("pokemon-type-names.json", type_names),
        _dump("pokemon-forms.json", forms),
        _dump("egg-items.json", egg_items),
        _dump("evolution-items.json", evolution_items),
        _dump("mega-stones.json", mega_stones),
        _dump("quest-steps.json", quest_steps),
        _dump("underground-items.json", underground_items),
        _dump(MANIFEST_FILE, manifest),
    ]
    return written


# --- main --------------------------------------------------------------------

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument(
        "--game-ref", default=PC_REF,
        help=f"PokeClicker git tag/branch to read (default {PC_REF}, the release "
             f"the editor targets; e.g. 'develop' to preview unreleased data)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    ref = parse_args(argv).game_ref
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

    print(f"\nFetching PokeClicker source at {ref}...")
    game_version = fetch_game_version(ref=ref)
    print(f"  game v{game_version}")
    type_names = fetch_pokemon_type_names(ref=ref)
    print(f"  {len(type_names)} pokemon types: {type_names[0]} ... {type_names[-1]}")
    berries = fetch_berry_names(ref=ref)
    print(f"  {len(berries)} berries: {berries[0]} ... {berries[-1]}")
    mulches = fetch_mulch_names(ref=ref)
    print(f"  {len(mulches)} mulches: {', '.join(mulches)}")
    types = fetch_pokemon_types(type_names, ref=ref)
    print(f"  {len(types)} pokemon type lists parsed")
    forms = fetch_pokemon_forms(type_names, ref=ref)
    print(f"  {len(forms)} pokemon forms parsed")

    egg_items, evolution_items, mega_stones = fetch_item_rosters(ref=ref)
    print(f"  {len(egg_items)} egg items, {len(evolution_items)} evolution items, "
          f"{len(mega_stones)} mega stones")

    quest_lines = fetch_quest_line_steps(ref=ref)
    print(f"  {len(quest_lines)} quest lines parsed")
    quest_steps = build_quest_steps_payload(game_version, quest_lines)

    underground_items = fetch_underground_items(ref=ref)
    print(f"  {len(underground_items)} underground items parsed")

    written = write_data_files(names, buckets, berries, mulches, types, forms,
                               egg_items, evolution_items, mega_stones,
                               quest_steps, underground_items, type_names,
                               build_manifest(game_version, ref))
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
