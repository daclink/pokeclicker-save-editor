"""Static reference data for the editor: regions, species names, berries,
gender buckets.

The actual data tables live in ``data/*.json`` so they can be consumed by
both the Python editor and (eventually) the browser-based companion app
without duplication. This module is a thin shim that loads the JSON at
import time and re-exports the same public symbols the rest of the editor
has always read — `NATIONAL_NAMES`, `BERRY_NAMES`, `MULCH_NAMES`,
`REGION_RANGES`, helpers — so callers don't change.

To regenerate the JSON files, run ``scripts/fetch_pokeclicker_data.py``;
that script pulls fresh data from PokeAPI and the public PokeClicker source
on GitHub and writes the same files this module reads.

The bucket data drives :meth:`pcedit_gui.PokedexTab._bump_stats`: when a
user opts into stat back-fill while marking pokémon caught, the right
``save.statistics.total<…>PokemonCaptured`` counter is incremented per
species.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def _resource_path(*parts: str) -> Path:
    """Locate a bundled data file in dev *and* PyInstaller bundles.

    Dev: ``<repo>/data/foo.json`` next to this module.
    Frozen: ``sys._MEIPASS/data/foo.json`` — PyInstaller extracts the
    ``--add-data data:data`` payload there.
    """
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base.joinpath(*parts)


def _load_json(name: str):
    path = _resource_path("data", name)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise SystemExit(
            f"missing reference data: {path}\n"
            f"run `python3 scripts/fetch_pokeclicker_data.py` to regenerate."
        ) from e


# --- region grouping --------------------------------------------------------

# Region IDs match PokeClicker's national-dex grouping. Hisui shares numbers
# with prior generations and is not exposed as its own range here.
REGION_RANGES: list[tuple[str, int, int]] = [
    (label, int(lo), int(hi))
    for label, lo, hi in _load_json("region-ranges.json")
]


# --- pokemon roster + gender buckets ---------------------------------------

NATIONAL_NAMES: list[str] = list(_load_json("pokemon-names.json"))

assert len(NATIONAL_NAMES) == 1025, (
    f"national roster is 1025 names, got {len(NATIONAL_NAMES)}"
)

_buckets = _load_json("gender-buckets.json")
_BUCKET_LABELS: tuple[str, ...] = tuple(_buckets["labels"])
_BUCKET_INDEX: str = _buckets["index"]

assert len(_BUCKET_INDEX) == len(NATIONAL_NAMES), (
    f"_BUCKET_INDEX length ({len(_BUCKET_INDEX)}) must match NATIONAL_NAMES "
    f"({len(NATIONAL_NAMES)})"
)


# --- berry + mulch rosters --------------------------------------------------

BERRY_NAMES: list[str] = list(_load_json("berry-names.json"))

assert len(BERRY_NAMES) == 70, (
    f"berry roster is 70 names, got {len(BERRY_NAMES)}"
)
assert BERRY_NAMES[0] == "Cheri" and BERRY_NAMES[-1] == "Hopo", (
    f"berry roster endpoints drifted: {BERRY_NAMES[0]!r} ... {BERRY_NAMES[-1]!r}"
)

MULCH_NAMES: list[str] = list(_load_json("mulch-names.json"))

assert len(MULCH_NAMES) >= 6, (
    f"mulch roster expected >=6 names, got {len(MULCH_NAMES)}"
)


# --- helpers ---------------------------------------------------------------

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
      - ``"totalGenderlessPokemonCaptured"`` — no gender (legendaries,
        fossils, Magnemite line, etc.).

    Returns ``None`` when ``pid`` is outside the table; callers should bump
    only the gender-neutral total in that case.
    """
    idx = _coerce_pid(pid)
    if idx is not None and 1 <= idx <= len(_BUCKET_INDEX):
        return _BUCKET_LABELS[int(_BUCKET_INDEX[idx - 1])]
    return None


def name_for_berry(idx: int | float | str) -> str:
    """Return the BerryType name for an index into ``save.farming.berryList``,
    or '?' if out of range."""
    n = _coerce_pid(idx)
    if n is not None and 0 <= n < len(BERRY_NAMES):
        return BERRY_NAMES[n]
    return "?"


def name_for_mulch(idx: int | float | str) -> str:
    """Return the MulchType display name for a ``save.farming.mulchList``
    position, or 'Slot N' for unnamed extra slots."""
    n = _coerce_pid(idx)
    if n is None or n < 0:
        return "?"
    if n < len(MULCH_NAMES):
        return MULCH_NAMES[n]
    return f"Slot {n}"


# Backward-compat alias for callers that still import KANTO_NAMES.
KANTO_NAMES = NATIONAL_NAMES[:151]
