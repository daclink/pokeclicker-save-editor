#!/usr/bin/env python3
"""Fetch Pokémon names + gender rates from PokeAPI and (re)generate
``pokeclicker_data.py``.

Run once locally; commit the regenerated module. Each species response is
cached under ``.cache/pokeapi/<id>.json`` so re-runs are instant. The cache
directory is gitignored (covered by the existing ``.cache`` rule).

The end product:
- ``NATIONAL_NAMES``: list of 1025 display names, indexed by ``pid - 1``.
- ``_BUCKET_INDEX`` + ``_BUCKET_LABELS``: compact compressed encoding of which
  ``save.statistics.total<…>PokemonCaptured`` counter to bump per species.
- ``name_for(pid)``, ``stat_bucket_for(pid)``, ``region_for(pid)`` helpers.

Stdlib only — no requests, no toml.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = REPO_ROOT / ".cache" / "pokeapi"
OUTPUT = REPO_ROOT / "pokeclicker_data.py"

SPECIES_URL = "https://pokeapi.co/api/v2/pokemon-species/{id}"
MAX_ID = 1025
THROTTLE_SEC = 0.05      # ~20 req/s; PokeAPI rate-limits are far more generous
TIMEOUT_SEC = 10
USER_AGENT = "pcedit-fetcher/1.0 (+https://github.com/daclink/pokeclicker-save-editor)"

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


def _fetch_url(url: str) -> dict:
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_species(pid: int, *, retries: int = 3) -> dict:
    """Return the species JSON for ``pid``, hitting cache first."""
    cache = CACHE_DIR / f"{pid}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    url = SPECIES_URL.format(id=pid)
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            data = _fetch_url(url)
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


# --- output formatter --------------------------------------------------------

REGION_RANGES_LITERAL = """\
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
"""

HEADER = '''\
"""Static reference data for the editor: regions, species names, gender buckets.

Generated by ``scripts/fetch_pokeapi_data.py`` from PokeAPI
(https://pokeapi.co). To regenerate, run that script and commit this file.

The bucket data drives :meth:`pcedit_gui.PokedexTab._bump_stats`: when a user
opts into stat back-fill while marking pokémon caught, the right
``save.statistics.total<…>PokemonCaptured`` counter is incremented per species.
"""
from __future__ import annotations

# Region IDs match PokeClicker's national-dex grouping. Hisui shares numbers
# with prior generations and is not exposed as its own range here.
'''

HELPERS = '''\

def _coerce_pid(pid: int | float | str) -> int | None:
    """Some saves emit ``id`` as a float or string; cast defensively."""
    try:
        return int(pid)
    except (TypeError, ValueError):
        return None


def name_for(pid: int | float | str) -> str:
    """Return a friendly name for a national-dex id, or '?' if unknown."""
    idx = _coerce_pid(pid)
    if idx is not None and 1 <= idx <= len(NATIONAL_NAMES):
        return NATIONAL_NAMES[idx - 1]
    return "?"


def region_for(pid: int | float | str) -> str:
    """Return the region label for a national-dex id, or '?' if unknown."""
    idx = _coerce_pid(pid)
    if idx is None:
        return "?"
    for label, lo, hi in REGION_RANGES:
        if lo <= idx <= hi:
            return label
    return "?"


def stat_bucket_for(pid: int | float | str) -> str | None:
    """Return the ``save.statistics`` counter key to bump for this species.

    One of:
      - ``"totalMalePokemonCaptured"`` — male-only or male-majority.
      - ``"totalFemalePokemonCaptured"`` — female-majority or female-only.
      - ``"totalGenderlessPokemonCaptured"`` — no gender (legendaries, fossils,
        Magnemite line, etc.).

    Returns ``None`` when ``pid`` is outside the table; callers should bump
    only the gender-neutral total in that case.
    """
    idx = _coerce_pid(pid)
    if idx is not None and 1 <= idx <= len(_BUCKET_INDEX):
        return _BUCKET_LABELS[int(_BUCKET_INDEX[idx - 1])]
    return None


# Backward-compat alias for callers that still import KANTO_NAMES.
KANTO_NAMES = NATIONAL_NAMES[:151]
'''


def chunk_names(names: list[str], width: int = 6) -> Iterable[str]:
    """Yield formatted lines of names, ``width`` per line, with region markers."""
    region_starts = {1: "Kanto", 152: "Johto", 252: "Hoenn", 387: "Sinnoh",
                     494: "Unova", 650: "Kalos", 722: "Alola", 810: "Galar",
                     906: "Paldea"}
    for i in range(0, len(names), width):
        chunk = names[i:i + width]
        first_pid = i + 1
        if first_pid in region_starts:
            yield f"    # --- {region_starts[first_pid]} (#{first_pid}–) ---"
        prefix = f"    "
        body = ", ".join(repr(n) for n in chunk)
        suffix = f",  # {first_pid}-{first_pid + len(chunk) - 1}"
        yield prefix + body + "," + " " * 1 + f"# {first_pid}-{first_pid + len(chunk) - 1}".rstrip(",")


def render_module(names: list[str], buckets: list[int]) -> str:
    """Build the full pokeclicker_data.py source from collected data."""
    parts: list[str] = [HEADER, "", REGION_RANGES_LITERAL, ""]

    parts.append("# National-dex display names, indexed by pid - 1.")
    parts.append("# Generated from PokeAPI; see scripts/fetch_pokeapi_data.py.")
    parts.append("NATIONAL_NAMES: list[str] = [")
    region_starts = {1: "Kanto", 152: "Johto", 252: "Hoenn", 387: "Sinnoh",
                     494: "Unova", 650: "Kalos", 722: "Alola", 810: "Galar",
                     906: "Paldea"}
    width = 6
    for i in range(0, len(names), width):
        first_pid = i + 1
        if first_pid in region_starts:
            parts.append(f"    # --- {region_starts[first_pid]} (#{first_pid}+)")
        chunk = names[i:i + width]
        body = ", ".join(repr(n) for n in chunk)
        parts.append(f"    {body},")
    parts.append("]")
    parts.append("")
    parts.append(f"assert len(NATIONAL_NAMES) == {len(names)}, "
                 f'f"national roster is {len(names)} names, got {{len(NATIONAL_NAMES)}}"')

    parts.append("")
    parts.append("# Per-id bucket index. One digit per id mapping into _BUCKET_LABELS:")
    parts.append("#   0 = male / male-majority / 50-50 default, 1 = female-majority / female,")
    parts.append("#   2 = genderless. Compact string keeps this file scannable.")
    parts.append("_BUCKET_LABELS: tuple[str, ...] = (")
    for label in BUCKET_LABELS:
        parts.append(f"    {label!r},")
    parts.append(")")
    parts.append("")

    # 80-char wrapped digit string
    digit_str = "".join(str(b) for b in buckets)
    parts.append("_BUCKET_INDEX: str = (")
    for i in range(0, len(digit_str), 80):
        parts.append(f"    {digit_str[i:i+80]!r}")
    parts.append(")")
    parts.append(f'assert len(_BUCKET_INDEX) == {len(buckets)}')

    parts.append(HELPERS)
    return "\n".join(parts) + "\n"


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

    src = render_module(names, buckets)
    OUTPUT.write_text(src, encoding="utf-8")
    print(f"\nOK wrote {OUTPUT.relative_to(REPO_ROOT)}  ({OUTPUT.stat().st_size} bytes)")
    return 0


try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

if __name__ == "__main__":
    sys.exit(main())
