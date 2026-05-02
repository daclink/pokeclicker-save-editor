#!/usr/bin/env python3
"""pcedit — PokeClicker save editor (CLI).

Round-trips byte-exact for unmodified saves. Backups follow the
`backup_layout` setting (folder by default, sidecar legacy) — see
`pcedit_backup`.
"""
from __future__ import annotations

import argparse
import datetime
import json
import shutil
import sys
from pathlib import Path

from pokeclicker_save import (
    decode_file,
    encode_file,
    decode_bytes,
    encode_bytes,
    get_path,
    set_path,
    _coerce_scalar,
)
from pcedit_backup import latest_backup, list_backups, make_backup

REGIONS = [
    "Kanto", "Johto", "Hoenn", "Sinnoh", "Unova",
    "Kalos", "Alola", "Galar", "Hisui", "Paldea",
]

# Indices into the player's wallet currencies array. Stable across saves.
CURRENCY = {"money": 0, "tokens": 1, "quest": 2, "diamonds": 3, "farm": 4, "battle": 5}


# --- IO helpers --------------------------------------------------------------

def _is_encoded(path: Path) -> bool:
    """Heuristic: encoded saves are base64 (start with 'eyJ' for {")."""
    head = path.read_bytes()[:8]
    return head.startswith(b"eyJ")


def load(path: str) -> dict:
    p = Path(path)
    if _is_encoded(p):
        return decode_file(p)
    return json.loads(p.read_text(encoding="utf-8"))


def save(data: dict, path: str, *, was_encoded: bool, backup: bool = True) -> None:
    p = Path(path)
    if backup and p.exists():
        make_backup(p)
    if was_encoded:
        encode_file(data, p)
    else:
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# --- subcommands -------------------------------------------------------------

def cmd_decode(args: argparse.Namespace) -> int:
    data = decode_file(args.input)
    out = args.output or str(Path(args.input).with_suffix(".decoded.json"))
    Path(out).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"decoded -> {out}")
    return 0


def cmd_encode(args: argparse.Namespace) -> int:
    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    out = args.output or str(Path(args.input).with_suffix(".txt"))
    encode_file(data, out)
    print(f"encoded -> {out}")
    return 0


def _fmt_seconds(s: float) -> str:
    s = int(s)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    return f"{h}h{m:02d}m{s:02d}s"


def cmd_summary(args: argparse.Namespace) -> int:
    d = load(args.input)
    p, s = d["player"], d["save"]
    region = REGIONS[p["_region"]] if p["_region"] < len(REGIONS) else p["_region"]
    last_seen = datetime.datetime.fromtimestamp(p["_lastSeen"] / 1000).isoformat(timespec="seconds")
    party = s.get("party", {}).get("caughtPokemon", [])
    stats = s.get("statistics", {})
    currencies = s.get("wallet", {}).get("currencies") or []

    print(f"trainer:       {p.get('trainerId')}  (created {datetime.datetime.fromtimestamp(p['_createdTime']/1000).date()})")
    print(f"last seen:     {last_seen}")
    print(f"location:      {region} sub {p.get('_subregion')} route {p.get('_route')}  ({p.get('_townName')})")
    print(f"highest:       {REGIONS[p['highestRegion']]} sub {p.get('highestSubRegion')}")
    print(f"badges:        {sum(1 for b in s.get('badgeCase', []) if b)} / {len(s.get('badgeCase', []))}")
    print(f"pokémon:       {len(party)} caught, {sum(1 for x in party if isinstance(x, dict) and x.get('shiny'))} shiny in party")
    print(f"play time:     {_fmt_seconds(stats.get('secondsPlayed', 0))}")
    print(f"money:         {currencies[0] if len(currencies)>0 else '-'}")
    print(f"dungeon tok:   {currencies[1] if len(currencies)>1 else '-'}")
    print(f"quest pts:     {currencies[2] if len(currencies)>2 else '-'}")
    print(f"farm pts:      {currencies[4] if len(currencies)>4 else '-'}")
    print(f"quests done:   {stats.get('questsCompleted', 0)}  (xp {s.get('quests',{}).get('xp')})")
    print(f"hatched:       {stats.get('totalPokemonHatched', 0)}")
    print(f"shinies caught:{stats.get('totalShinyPokemonCaptured', 0)}")
    print(f"underground:   {stats.get('undergroundItemsFound', 0)} items, {stats.get('undergroundLayersMined', 0)} layers")
    return 0


def cmd_get(args: argparse.Namespace) -> int:
    d = load(args.input)
    val = get_path(d, args.path)
    if isinstance(val, (dict, list)):
        print(json.dumps(val, ensure_ascii=False, indent=2))
    else:
        print(val)
    return 0


def cmd_set(args: argparse.Namespace) -> int:
    p = Path(args.input)
    was_encoded = _is_encoded(p)
    d = load(args.input)
    # parse value as JSON if possible, else keep as scalar
    try:
        value = json.loads(args.value)
    except json.JSONDecodeError:
        value = _coerce_scalar(args.value)
    set_path(d, args.path, value)
    out = args.output or args.input
    save(d, out, was_encoded=was_encoded)
    print(f"set {args.path} = {value!r} -> {out}")
    return 0


def cmd_money(args: argparse.Namespace) -> int:
    return _set_currency(args, CURRENCY["money"])


def cmd_tokens(args: argparse.Namespace) -> int:
    return _set_currency(args, CURRENCY["tokens"])


def cmd_quest_pts(args: argparse.Namespace) -> int:
    return _set_currency(args, CURRENCY["quest"])


def cmd_farm_pts(args: argparse.Namespace) -> int:
    return _set_currency(args, CURRENCY["farm"])


def _set_currency(args: argparse.Namespace, idx: int) -> int:
    p = Path(args.input)
    was_encoded = _is_encoded(p)
    d = load(args.input)
    arr = d["save"]["wallet"]["currencies"]
    while len(arr) <= idx:
        arr.append(0)
    if args.add:
        arr[idx] += int(args.amount)
    else:
        arr[idx] = int(args.amount)
    out = args.output or args.input
    save(d, out, was_encoded=was_encoded)
    print(f"currencies[{idx}] = {arr[idx]} -> {out}")
    return 0


def cmd_give(args: argparse.Namespace) -> int:
    p = Path(args.input)
    was_encoded = _is_encoded(p)
    d = load(args.input)
    items = d["player"]["_itemList"]
    cur = items.get(args.item, 0)
    if args.set:
        items[args.item] = int(args.amount)
    else:
        items[args.item] = cur + int(args.amount)
    out = args.output or args.input
    save(d, out, was_encoded=was_encoded)
    print(f"{args.item}: {cur} -> {items[args.item]} -> {out}")
    return 0


def cmd_keyitem(args: argparse.Namespace) -> int:
    p = Path(args.input)
    was_encoded = _is_encoded(p)
    d = load(args.input)
    ki = d["save"]["keyItems"]
    if args.name not in ki:
        print(f"warning: {args.name!r} not in keyItems; valid keys:")
        print("  " + ", ".join(sorted(ki.keys())))
        return 1
    ki[args.name] = not args.off
    out = args.output or args.input
    save(d, out, was_encoded=was_encoded)
    print(f"{args.name}: {ki[args.name]} -> {out}")
    return 0


def cmd_berry(args: argparse.Namespace) -> int:
    p = Path(args.input)
    was_encoded = _is_encoded(p)
    d = load(args.input)
    arr = d["save"]["farming"]["unlockedBerries"]
    if args.index >= len(arr):
        print(f"index {args.index} out of range (len {len(arr)})")
        return 1
    arr[args.index] = 0 if args.off else 1
    out = args.output or args.input
    save(d, out, was_encoded=was_encoded)
    unlocked = sum(1 for v in arr if v)
    print(f"berry[{args.index}] = {arr[args.index]} ({unlocked}/{len(arr)} unlocked) -> {out}")
    return 0


def cmd_caught(args: argparse.Namespace) -> int:
    d = load(args.input)
    party = d["save"]["party"]["caughtPokemon"]
    rows = []
    for entry in party:
        if not isinstance(entry, dict):
            continue
        # JSON numeric keys come through as strings in Python
        rows.append((
            entry.get("id"),
            entry.get("0", 0),     # attack bonus from hatching
            entry.get("1", 0),     # pokerus
            entry.get("3", 0),     # exp
            "E" if entry.get("4") else " ",  # in-egg / breeding-pending
            "R" if entry.get("5") else " ",
        ))
    rows.sort(key=lambda r: r[0])
    print(f"{'id':>4}  {'atkB':>5}  {'prus':>4}  {'exp':>10}  egg  res")
    for r in rows:
        print(f"{r[0]:>4}  {r[1]:>5}  {r[2]:>4}  {r[3]:>10}   {r[4]}    {r[5]}")
    print(f"\n{len(rows)} entries")
    return 0


def cmd_undo(args: argparse.Namespace) -> int:
    target = Path(args.input)
    bak = latest_backup(target)
    if bak is None:
        print(f"no backup found for {target}")
        print(f"  looked for {target.suffix}.bak next to the file and any "
              f"timestamped .bak files inside a sibling bak/ folder.")
        return 1
    shutil.copy2(bak, target)
    print(f"restored {target} from {bak}")
    return 0


def cmd_dump(args: argparse.Namespace) -> int:
    d = load(args.input)
    out = args.output or str(Path(args.input).with_suffix(".decoded.json"))
    Path(out).write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"dumped -> {out}")
    return 0


# --- argparse wiring ---------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="pcedit", description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("decode", help="base64 save -> pretty JSON")
    p.add_argument("input")
    p.add_argument("-o", "--output")
    p.set_defaults(fn=cmd_decode)

    p = sub.add_parser("encode", help="JSON -> base64 save")
    p.add_argument("input")
    p.add_argument("-o", "--output")
    p.set_defaults(fn=cmd_encode)

    p = sub.add_parser("summary", help="show snapshot of save")
    p.add_argument("input")
    p.set_defaults(fn=cmd_summary)

    p = sub.add_parser("get", help="read a value at a JSON path")
    p.add_argument("input")
    p.add_argument("path")
    p.set_defaults(fn=cmd_get)

    p = sub.add_parser("set", help="write a value at a JSON path")
    p.add_argument("input")
    p.add_argument("path")
    p.add_argument("value", help="JSON literal or scalar (int/float/true/false/null/string)")
    p.add_argument("-o", "--output", help="write to a different file (default: in place)")
    p.set_defaults(fn=cmd_set)

    for name, fn in [
        ("money", cmd_money),
        ("tokens", cmd_tokens),
        ("quest-points", cmd_quest_pts),
        ("farm-points", cmd_farm_pts),
    ]:
        p = sub.add_parser(name, help=f"set/add {name.replace('-',' ')}")
        p.add_argument("input")
        p.add_argument("amount", type=int)
        p.add_argument("--add", action="store_true", help="add instead of set")
        p.add_argument("-o", "--output")
        p.set_defaults(fn=fn)

    p = sub.add_parser("give", help="add to or set an item count in player._itemList")
    p.add_argument("input")
    p.add_argument("item", help="exact key, e.g. Pokeball, Greatball, Lucky_egg, Yellow_shard")
    p.add_argument("amount", type=int)
    p.add_argument("--set", action="store_true", help="overwrite instead of add")
    p.add_argument("-o", "--output")
    p.set_defaults(fn=cmd_give)

    p = sub.add_parser("keyitem", help="enable/disable a key item")
    p.add_argument("input")
    p.add_argument("name", help="exact key, e.g. Explorer_kit, Super_rod, Holo_caster")
    p.add_argument("--off", action="store_true")
    p.add_argument("-o", "--output")
    p.set_defaults(fn=cmd_keyitem)

    p = sub.add_parser("berry", help="unlock/lock a berry by index")
    p.add_argument("input")
    p.add_argument("index", type=int)
    p.add_argument("--off", action="store_true")
    p.add_argument("-o", "--output")
    p.set_defaults(fn=cmd_berry)

    p = sub.add_parser("caught", help="list caught pokémon")
    p.add_argument("input")
    p.set_defaults(fn=cmd_caught)

    p = sub.add_parser("undo", help="restore file from its .bak")
    p.add_argument("input")
    p.set_defaults(fn=cmd_undo)

    p = sub.add_parser("dump", help="alias for decode")
    p.add_argument("input")
    p.add_argument("-o", "--output")
    p.set_defaults(fn=cmd_dump)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
