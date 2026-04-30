"""PokeClicker save format helpers.

A PokeClicker save export is base64 of a JSON document. The JSON is *not* UTF-8
clean — the game writes some strings (e.g. "Pokémon") as Latin-1 bytes inside
the JSON. Decoding as latin-1 and serializing with the same separators the
game uses (`,` / `:`) round-trips byte-exactly.
"""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Any, Iterable


# PokeClicker writes JSON with no whitespace; matching this preserves byte-exact
# round-trips for unmodified saves.
_JSON_KW = dict(ensure_ascii=False, separators=(",", ":"))


def decode_bytes(b64: bytes) -> dict:
    """Decode a base64 save export to a Python dict."""
    raw = base64.b64decode(b64)
    return json.loads(raw.decode("latin-1"))


def encode_bytes(data: dict) -> bytes:
    """Encode a Python dict back to a base64 save export."""
    text = json.dumps(data, **_JSON_KW)
    return base64.b64encode(text.encode("latin-1"))


def decode_file(path: str | Path) -> dict:
    return decode_bytes(Path(path).read_bytes())


def encode_file(data: dict, path: str | Path) -> None:
    Path(path).write_bytes(encode_bytes(data))


# --- JSON path traversal -----------------------------------------------------
#
# Path syntax: dot-separated keys, with optional [N] for list indices and
# [key=value] for selecting a dict inside a list by id field.
#
#   player._itemList.Pokeball
#   save.wallet.currencies[0]
#   save.party.caughtPokemon[id=25]
#   save.oakItems.Amulet_Coin.level

_TOKEN_RE = re.compile(r"\[([^\]]+)\]|([^.\[\]]+)")


def _tokenize(path: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for m in _TOKEN_RE.finditer(path):
        bracket, dot = m.group(1), m.group(2)
        if dot is not None:
            out.append(("key", dot))
        else:
            assert bracket is not None
            if "=" in bracket:
                k, v = bracket.split("=", 1)
                out.append(("match", f"{k}={v}"))
            else:
                out.append(("index", bracket))
    return out


def _coerce_scalar(s: str) -> Any:
    """Best-effort coerce a string from CLI/path into JSON scalar."""
    if s == "true":
        return True
    if s == "false":
        return False
    if s == "null":
        return None
    try:
        return int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        pass
    return s


def get_path(data: Any, path: str) -> Any:
    cur = data
    for kind, val in _tokenize(path):
        if kind == "key":
            cur = cur[val]
        elif kind == "index":
            cur = cur[int(val)]
        else:  # match
            k, v = val.split("=", 1)
            v = _coerce_scalar(v)
            cur = next(item for item in cur if item.get(k) == v)
    return cur


def set_path(data: Any, path: str, value: Any) -> None:
    """Set the value at the given path. Intermediate containers must exist."""
    tokens = _tokenize(path)
    if not tokens:
        raise ValueError("empty path")
    *parent, (last_kind, last_val) = tokens
    cur = data
    for kind, val in parent:
        if kind == "key":
            cur = cur[val]
        elif kind == "index":
            cur = cur[int(val)]
        else:
            k, v = val.split("=", 1)
            v = _coerce_scalar(v)
            cur = next(item for item in cur if item.get(k) == v)
    if last_kind == "key":
        cur[last_val] = value
    elif last_kind == "index":
        cur[int(last_val)] = value
    else:
        k, v = last_val.split("=", 1)
        v = _coerce_scalar(v)
        for item in cur:
            if item.get(k) == v:
                item.clear()
                if isinstance(value, dict):
                    item.update(value)
                return
        raise KeyError(f"no item with {k}={v} in list")


def iter_paths(data: Any, prefix: str = "") -> Iterable[tuple[str, Any]]:
    """Yield (path, value) for every leaf — useful for dumping a save."""
    if isinstance(data, dict):
        for k, v in data.items():
            yield from iter_paths(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(data, list):
        for i, v in enumerate(data):
            yield from iter_paths(v, f"{prefix}[{i}]")
    else:
        yield prefix, data
