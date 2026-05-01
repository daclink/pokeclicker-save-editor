# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

When cutting a release, run `python3 scripts/release.py <version>` — it
extracts the matching section from this file and uses it as the GitHub
Release notes.

## [Unreleased]

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

[Unreleased]: https://github.com/daclink/pokeclicker-save-editor/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/daclink/pokeclicker-save-editor/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/daclink/pokeclicker-save-editor/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/daclink/pokeclicker-save-editor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/daclink/pokeclicker-save-editor/releases/tag/v0.1.0
