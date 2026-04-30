# pokeclicker-editor

A small Python CLI for inspecting and editing [PokeClicker](https://www.pokeclicker.com/) save exports. Tested against `v0.10.25`.

## Save format

A PokeClicker `.txt` save export is **base64 of a JSON document**.

The JSON is *not* UTF-8 clean — strings like `"Pokémon"` are stored as Latin-1 bytes inside the JSON payload. Decoding the base64, then decoding the bytes as `latin-1`, then `json.loads` parses it. Re-serializing with no whitespace (`separators=(",", ":")`) and re-encoding as `latin-1` produces a **byte-exact** round-trip.

Top-level shape:

```
{
  "player":   { _region, _route, _townName, _itemList, ... },
  "save":     { wallet, party, badgeCase, statistics, quests, ... },
  "settings": { ... 290 UI/preference keys ... }
}
```

A few observed conventions worth knowing:

- **`save.wallet.currencies`** is positional: `[money, dungeonTokens, questPoints, diamonds, farmPoints, battlePoints]`.
- **`save.party.caughtPokemon[i]`** is a dict whose keys are integer-strings:
  - `"0"` — attack bonus from hatching (25 = first hatch tier).
  - `"1"` — pokerus state.
  - `"2"` — EVs by attack type (`{"0": n, "1": n, ...}`).
  - `"3"` — total exp.
  - `"4"` — currently in the egg/breeding list.
  - `"5"` — resistant flag.
  - Plus a regular `"id"` key for the Pokédex number.
- **`save.logbook.logs`** is a 100-entry ring buffer; almost every save has 100 differing positions because the in-game log scrolled.
- **Type drift `int ↔ float`** appears in `*.durability`, `*.timeUntilDiscovery`, etc. JS serializes whole-number floats as ints, so the same field shows as `27` or `27.0` depending on whether a tick happens to be a whole number.

## Install

Pure standard library, no dependencies. Requires Python ≥ 3.10.

```sh
git clone <this repo>
cd pokeclicker-editor
python3 pcedit.py --help
```

## Examples

```sh
# Show a snapshot
python3 pcedit.py summary "[v0.10.25] PokeClicker 2026-04-30 19_55_05.txt"

# Decode to pretty JSON for inspection
python3 pcedit.py decode save.txt -o save.json

# Re-encode an edited JSON back into a save file
python3 pcedit.py encode save.json -o save.txt

# Read any field by JSON path
python3 pcedit.py get save.txt save.statistics.totalMoney
python3 pcedit.py get save.txt 'save.party.caughtPokemon[id=25]'
python3 pcedit.py get save.txt 'save.wallet.currencies[0]'

# Write any field by JSON path (auto-backs up to *.bak)
python3 pcedit.py set save.txt save.quests.xp 99999
python3 pcedit.py set save.txt 'save.oakItems.Amulet_Coin.level' 9

# Currency shortcuts
python3 pcedit.py money  save.txt 9999999
python3 pcedit.py tokens save.txt 1000000 --add        # add to current
python3 pcedit.py quest-points save.txt 50000
python3 pcedit.py farm-points  save.txt 10000

# Inventory
python3 pcedit.py give save.txt Pokeball 100
python3 pcedit.py give save.txt Lucky_egg 50 --set     # overwrite
python3 pcedit.py give save.txt Yellow_shard 999

# Key items / berries
python3 pcedit.py keyitem save.txt Explorer_kit
python3 pcedit.py keyitem save.txt Holo_caster --off
python3 pcedit.py berry   save.txt 0                   # unlock berry #0
python3 pcedit.py berry   save.txt 4 --off             # lock berry #4

# Caught pokémon table
python3 pcedit.py caught  save.txt
```

## Path syntax

The `get`/`set` commands accept dot-separated paths with two extras:

| form | meaning |
|---|---|
| `a.b.c` | nested keys |
| `a[3]` | list index |
| `a[id=25]` | first dict in list whose `id` field equals `25` (ints/floats/strings supported) |

The `[k=v]` form also matches by `name`, `region`, `berry`, etc. — anything stable inside the list.

## Safety

- `set` and the convenience commands write to the original file by default, **after copying it to `<file>.bak`**. Use `-o new_save.txt` to write to a new file instead.
- Round-trip is byte-exact for unmodified saves — verified with the test cases this repo was developed against.
- The tool does **not** validate game logic. You can hand the game a Pokédex entry it doesn't expect, and the game may crash or sanitize it on the next save. Edit small things first, save in-game, and confirm before going wild.
- This is for tinkering with your own local save. Don't use it for cheating online leaderboards (PokeClicker is single-player but be a good neighbor).

## Library use

```python
from pokeclicker_save import decode_file, encode_file, get_path, set_path

data = decode_file("save.txt")
print(get_path(data, "save.statistics.totalMoney"))
set_path(data, "save.wallet.currencies[0]", 1_000_000)
encode_file(data, "save.txt")
```

## Repo layout

```
pokeclicker_save.py   format library (decode, encode, path get/set)
pcedit.py             CLI entry point
README.md             this file
.gitignore
```
