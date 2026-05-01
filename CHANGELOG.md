# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

When cutting a release, run `python3 scripts/release.py <version>` — it
extracts the matching section from this file and uses it as the GitHub
Release notes.

## [Unreleased]

### Added
- **App icon.** Pokéball SVG sourced from
  [pokeclicker.com](https://www.pokeclicker.com/) rendered into platform
  icon files (`assets/icon/PCEdit.icns`, `PCEdit.ico`, `PCEdit-256.png`,
  `PCEdit-512.png`). Embedded into the macOS `.app` and Windows `.exe`
  builds via PyInstaller's `--icon`. Source SVG and a `make_icons.py`
  regen script (ImageMagick + `iconutil`) are checked in so contributors
  can rebuild without copying binaries by hand.
- **macOS installer** (`scripts/build_macos.py`): PyInstaller-based builder
  that produces `dist/PCEdit.app` and `dist/PCEdit-macos.dmg`
  (drag-to-`/Applications`, ~12 MB). Defaults to `--target-arch
  universal2` with a graceful fallback to the native arch when the
  building Python isn't universal2-capable.
- **Windows installer** (`scripts/build_windows.py`): single-file
  `dist/PCEdit-windows.exe` via `pyinstaller --onefile --windowed`.
- **Linux build** (`scripts/build_linux.py`): single ELF
  `dist/PCEdit-linux-x86_64` plus a `.tar.gz` containing the executable,
  the 256 px icon, a `.desktop` entry, and a short README for desktop
  integration.
- **CI matrix** (`.github/workflows/release.yml`): builds the macOS,
  Windows, and Linux artefacts on every push to a `release/**` branch
  (uploaded as workflow artefacts) and on every `v*` tag push (attached
  to the corresponding GitHub Release). Closes
  [#3](https://github.com/daclink/pokeclicker-save-editor/issues/3).
- README "Building installers locally" rewritten for all three platforms;
  new "Regenerating the app icon" subsection. Repo layout entry updated
  with the new files.
- README "Download & install" section near the top of the file with a
  per-platform download/install table and a link to the latest release
  page, so first-time users land on a binary without scrolling.

### Fixed
- Build scripts crashed on Windows when printing the success summary
  (cp1252 codec couldn't encode the `✓` glyph). Switched all build
  scripts to ASCII output and added `sys.stdout.reconfigure(encoding=
  "utf-8", errors="replace")` as defence-in-depth. The Windows CI build
  now succeeds end-to-end.

## [0.3.1] — 2026-05-01

### Added
- **Caught Pokémon** tab: new read-only `Name` column to the right of `ID`,
  populated via `name_for(pid)` from `pokeclicker_data.py`. Falls back to
  `?` for IDs outside Kanto until the full national-dex roster is filled in
  ([#4](https://github.com/daclink/pokeclicker-save-editor/issues/4)). The
  edit dialog title and header now include the species name when known
  ([#9](https://github.com/daclink/pokeclicker-save-editor/issues/9)).

## [0.3.0] — 2026-05-01

### Added
- `CHANGELOG.md` (Keep a Changelog format) tracking every release.
- `scripts/release.py` — reads a version section out of `CHANGELOG.md` and
  drives `gh release create --notes-file -` so release notes always match
  what's in the repo. Supports `--dry-run` for preview before publishing.
- README "Releasing" section documenting the changelog-driven workflow
  ([#7](https://github.com/daclink/pokeclicker-save-editor/issues/7)).

### Changed
- README "Opening a save" subsection rewritten with a screenshot
  (`screenshots/clicker-editor-ui.png`) and step-by-step instructions for
  the first-launch flow. Removed the redundant "Top bar buttons" list now
  that the same info is covered above the tabs table.

## [0.2.1] — 2026-05-01

### Fixed
- Top-bar buttons (Browse / Reload / Save / Undo) clipped off the right
  edge of the default-size window. Split the bar into two rows so the path
  label can expand and the action buttons are always visible
  ([#2](https://github.com/daclink/pokeclicker-save-editor/issues/2)).

## [0.2.0] — 2026-05-01

### Added
- New **Pokédex** tab: region dropdown over a listbox of every pokémon
  in that range, with caught entries marked `✓` and dimmed.
- *Mark selected caught* and *Mark all uncaught in region* actions; new
  entries are minimal stubs that don't overwrite existing dex data.
- *Show uncaught only* toggle to focus the listbox on what's left.
- `pokeclicker_data.py` module: `REGION_RANGES` (Kanto … Paldea) and
  `KANTO_NAMES` (151 entries). Friendly names beyond Kanto are tracked in
  [#4](https://github.com/daclink/pokeclicker-save-editor/issues/4).
- README Roadmap section.

### Notes
- The in-game capture statistics (`save.statistics.totalPokemonCaptured`,
  per-id counts) are not back-filled when marking caught; tracked in
  [#5](https://github.com/daclink/pokeclicker-save-editor/issues/5).

## [0.1.0] — 2026-04-30

### Added
- First usable release: library, CLI, Tk GUI.
- Library (`pokeclicker_save.py`): byte-exact base64 ↔ JSON decode/encode
  with the Latin-1 quirk handled, plus `get_path` / `set_path` accepting
  `a.b[0]` and `a[id=25]` selectors.
- CLI (`pcedit.py`): `summary`, `decode`, `encode`, `get`, `set`, `money`,
  `tokens`, `quest-points`, `farm-points`, `give`, `keyitem`, `berry`,
  `caught`, `undo`. Every write creates a `.bak` first.
- GUI (`pcedit_gui.py`) with four tabs:
  - **Currencies & Multipliers**: PokéDollars, Dungeon Tokens, Quest
    Points, Diamonds, Farm Points, Protein price multiplier.
  - **Eggs**: full edit + Grass / Fire / Water / Dragon / Mystery quick-add.
  - **Shards**: 16 type-shard colours with bulk fill / zero buttons.
  - **Caught Pokémon**: editable table with double-click dialog.
- Round-trip verified byte-exact on the v0.10.25 sample save.

[Unreleased]: https://github.com/daclink/pokeclicker-save-editor/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/daclink/pokeclicker-save-editor/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/daclink/pokeclicker-save-editor/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/daclink/pokeclicker-save-editor/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/daclink/pokeclicker-save-editor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/daclink/pokeclicker-save-editor/releases/tag/v0.1.0
