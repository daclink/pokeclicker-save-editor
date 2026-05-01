# pokeclicker-editor
USE AT YOUR OWN RISK. UNOFFICIAL
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

## Requirements

- Python **≥ 3.10**.
- For the GUI: that Python must include the `tkinter` module (most distros ship it; bare Homebrew Python on macOS does not, see below).
- No third-party packages — pure standard library.

Verify Tk:

```sh
python3 -c "import tkinter; print('tk', tkinter.TkVersion)"
```

If that errors with `ModuleNotFoundError: No module named '_tkinter'`:

| OS | fix |
|---|---|
| macOS, Apple Silicon Homebrew | use `/opt/homebrew/bin/python3` — ships Tk 9.0. |
| macOS, Intel Homebrew | `brew install python-tk@3.13` (or whichever 3.x you use). |
| macOS, Apple's `/usr/bin/python3` | Tk requires macOS 26+; prefer a Homebrew Python. |
| Debian / Ubuntu | `sudo apt install python3-tk` |
| Fedora | `sudo dnf install python3-tkinter` |
| Windows | bundled with the installer from python.org. |

The CLI (`pcedit.py`) does **not** need Tk — only `pcedit_gui.py` does.

## Build

There is nothing to compile — this is plain Python. "Build" is just getting the code in place.

```sh
git clone <this repo> pokeclicker-editor
cd pokeclicker-editor

# sanity-check the CLI
python3 pcedit.py --help

# sanity-check the GUI (opens an empty window — close it)
python3 pcedit_gui.py
```

Optional conveniences:

```sh
# Make the scripts directly executable.
chmod +x pcedit.py pcedit_gui.py
./pcedit.py --help

# Add a shell alias so you can run from anywhere.
alias pcedit='python3 /path/to/pokeclicker-editor/pcedit.py'
alias pcedit-gui='python3 /path/to/pokeclicker-editor/pcedit_gui.py'

# Optional virtualenv. Not necessary (no deps) but harmless.
python3 -m venv .venv && source .venv/bin/activate
```

To bundle a single-file standalone GUI (no Python install required by the end user):

```sh
pip install pyinstaller
pyinstaller --onefile --windowed --name PCEdit pcedit_gui.py
# binary lands in ./dist/PCEdit  (or PCEdit.exe on Windows)
```

PyInstaller is the only step that brings in a non-stdlib dependency, and it's only needed if you want to ship a frozen binary.

## Usage

### Workflow

1. In PokeClicker, open Settings → Save → **Download Save** to get a `.txt`.
2. Run `pcedit_gui.py <save.txt>` (or use the CLI), edit, click Save.
3. The original file is copied to `<save>.txt.bak` automatically.
4. In PokeClicker, Settings → Save → **Import Save** and pick the edited `.txt`.
5. If the game refuses or behaves oddly, hit **Undo (.bak)** in the GUI (or `pcedit.py undo <save.txt>`) to roll back.

### GUI

```sh
python3 pcedit_gui.py                              # empty window, use Browse…
python3 pcedit_gui.py path/to/save.txt             # auto-load on launch
```

Three tabs:

| tab | what you can change |
|---|---|
| **Currencies & Multipliers** | PokéDollars, Dungeon Tokens, Quest Points, Diamonds, Farm Points, and the **Protein price multiplier** (`player._itemMultipliers["Protein\|money"]`). Use the *Reset to 1.0* button to make vitamins cheap again. |
| **Eggs** | The breeding `eggList` (one row per slot). *Edit selected* opens a form. *Hatch now* sets `steps = totalSteps`. *Make empty* clears a slot back to `{type: -1, pokemon: 0}`. *Add egg* / *Remove* manage entries. **Quick-add** buttons drop a Grass / Fire / Water / Dragon / Mystery egg into the first empty slot (or append, bumping `eggSlots`). The `eggSlots` field above the table controls how many slots the game shows. |
| **Shards** | Counts for the 16 type-shard colors (Red/Yellow/Green/Blue, Black/Grey, Purple/Crimson, Pink/White, Cyan/Lime, Rose/Ochre, Beige/Indigo). Editing a color you haven't unlocked yet is fine — it appears once you reach the right region. Buttons set the whole grid to 999 / 9999 / 0 in one click. Any unrecognised `*_shard` items in the save show up in the "Other" panel below the grid. |
| **Caught Pokémon** | All caught pokémon, sortable by ID. Double-click a row (or *Edit selected…*) to change `atkBonus` (`.0`, increments by 25 per hatch), `pokerus` (`.1`), `exp` (`.3`), and toggle the in-egg (`.4`) and resistant (`.5`) flags. Quick-action buttons set common values without opening a dialog. |
| **Pokédex** | Region dropdown (Kanto … Paldea) over a listbox of every pokémon in that range. Caught entries are marked with `✓` and dimmed; uncaught are blank. Multi-select rows and click *Mark selected caught*, or *Mark all uncaught in region* to fill the entire region in one click. *Show uncaught only* hides the already-caught rows. New entries are minimal stubs (`{"2": {"0":0,"1":0,"2":0}, "3": 1, "id": <n>}`); the in-game capture statistics (`totalPokemonCaptured` etc.) are **not** updated, so the Trainer Card numbers won't move even though the pokémon will appear caught in the dex. |

Top bar buttons:

- **Browse…** — open a save from anywhere.
- **Reload** — discard pending edits and re-read from disk.
- **Save** — write the file in place after copying it to `<file>.bak`.
- **Undo (.bak)** — confirm, then restore from the backup and reload.

The status bar at the bottom shows what just happened.

### CLI

```sh
python3 pcedit.py <command> <save.txt> [args]
```

Reference:

| command | description |
|---|---|
| `summary <save>` | One-screen snapshot: location, badges, money, play time, etc. |
| `decode <save> [-o out.json]` | Base64 save → pretty JSON. |
| `encode <json> [-o out.txt]` | Pretty JSON → base64 save. |
| `dump <save> [-o out.json]` | Alias for `decode`. |
| `get <save> <path>` | Read any field by [path](#path-syntax). |
| `set <save> <path> <value> [-o out]` | Write any field. Value parsed as JSON literal first, then scalar. |
| `money <save> <amount> [--add]` | Set/add PokéDollars (`currencies[0]`). |
| `tokens <save> <amount> [--add]` | Set/add Dungeon Tokens (`currencies[1]`). |
| `quest-points <save> <amount> [--add]` | Set/add Quest Points (`currencies[2]`). |
| `farm-points <save> <amount> [--add]` | Set/add Farm Points (`currencies[4]`). |
| `give <save> <item> <amount> [--set]` | Add (or `--set`) an inventory item count in `player._itemList`. |
| `keyitem <save> <name> [--off]` | Toggle a key item under `save.keyItems`. |
| `berry <save> <index> [--off]` | Unlock/lock a berry by index. |
| `caught <save>` | Print a table of caught pokémon (id, atkBonus, pokerus, exp, flags). |
| `undo <save>` | Restore the file from its `.bak`. |

All write commands take `-o <new-path>` to leave the original alone. Otherwise the original is copied to `<file>.bak` and overwritten in place.

#### Examples

```sh
# Inspect
python3 pcedit.py summary save.txt
python3 pcedit.py decode  save.txt -o save.json
python3 pcedit.py get     save.txt save.statistics.totalMoney
python3 pcedit.py get     save.txt 'save.party.caughtPokemon[id=25]'

# Currencies
python3 pcedit.py money        save.txt 9999999
python3 pcedit.py tokens       save.txt 1000000 --add
python3 pcedit.py quest-points save.txt 50000
python3 pcedit.py farm-points  save.txt 10000

# Diamonds (no shortcut — use raw set)
python3 pcedit.py set save.txt 'save.wallet.currencies[3]' 500

# Protein price multiplier
python3 pcedit.py set save.txt 'player._itemMultipliers.Protein|money' 1.0

# Inventory (shards live here too)
python3 pcedit.py give save.txt Pokeball     100
python3 pcedit.py give save.txt Lucky_egg     50 --set
python3 pcedit.py give save.txt Yellow_shard 999
python3 pcedit.py give save.txt Pink_shard   500 --set

# Eggs (manipulate the array directly)
python3 pcedit.py get save.txt 'save.breeding.eggList[0]'
python3 pcedit.py set save.txt 'save.breeding.eggList[0].steps' 1200   # hatch slot 0

# Pokémon edits
python3 pcedit.py set save.txt 'save.party.caughtPokemon[id=25].3' 1000000   # exp
python3 pcedit.py set save.txt 'save.party.caughtPokemon[id=25].5' true       # resistant

# Key items / berries / quests
python3 pcedit.py keyitem save.txt Explorer_kit
python3 pcedit.py keyitem save.txt Holo_caster --off
python3 pcedit.py berry   save.txt 0
python3 pcedit.py set     save.txt save.quests.xp 99999

# Recover
python3 pcedit.py undo save.txt
```

### Library

```python
from pokeclicker_save import decode_file, encode_file, get_path, set_path

data = decode_file("save.txt")
print(get_path(data, "save.statistics.totalMoney"))
set_path(data, "save.wallet.currencies[0]", 1_000_000)
encode_file(data, "save.txt")
```

`decode_file` / `encode_file` operate on filesystem paths. `decode_bytes` / `encode_bytes` operate on raw base64 bytes if you'd rather pipe data through.

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

## Repo layout

```
pokeclicker_save.py   format library (decode, encode, path get/set)
pokeclicker_data.py   static reference data (region ranges, Kanto names)
pcedit.py             CLI entry point
pcedit_gui.py         Tk GUI editor
README.md             this file
LICENSE               CC0 1.0
.gitignore
```

## Roadmap

Tracking, in rough priority:

- [ ] **Platform installers.** Ship pre-built single-file binaries so end-users don't need a Python install:
  - macOS: `pyinstaller --onefile --windowed` → `.app` bundle, packaged into a signed `.dmg`.
  - Windows: same `pyinstaller` invocation → `.exe`, optionally wrapped in an MSI via `wix`.
  - Linux: AppImage (via `python-appimage`) or a `.deb` for Ubuntu/Debian.
  - CI workflow that builds all three on tag push and attaches them to the GitHub release.
- [ ] **Pokédex names beyond Kanto.** Currently `pokeclicker_data.py` has only Kanto names; later regions show ID numbers without a friendly name. Embedding the full national-dex roster (~1025 entries) is one option; pulling from a small data file at startup is another.
- [ ] **Pokédex stat back-fill.** When marking pokémon caught from the Pokédex tab, also bump `save.statistics.totalPokemonCaptured` and per-id capture counts so the Trainer Card numbers match.
- [ ] **Schema diff for new game versions.** A fixture-driven test that decodes saves from each minor version and asserts the editor's known-keys still resolve, so we notice when v0.10.26 (etc.) shifts something.
