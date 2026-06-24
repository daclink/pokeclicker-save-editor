# Web Editor Redesign — Phase 1: Foundation

**Date:** 2026-06-09
**Status:** Approved design (pending user review)
**Branch:** `feat/web-redesign-phase1`

## Context

The browser editor (`web/`, Svelte 5 + Vite, vanilla CSS) has reached feature
parity with the desktop app (Currencies, Eggs, Shards, Gems, Flutes, Berries,
Caught). The decision has been made to make **the web app the product**: the
desktop app will be deprecated. The web UI today is clean but visually
anonymous — hardcoded colors (`#666`, `#222`, `#2563eb`) repeated across ~2,840
lines of per-tab CSS, light-only, no identity, no design tokens.

This spec covers **Phase 1 — Foundation**: the load-bearing design pass that
everything downstream depends on. Two follow-on workstreams are explicitly
**out of scope** for this spec:

- **Phase 2 — Tab migration:** convert the 7 tab components to the new tokens
  and shared primitives. Its own spec → plan → PR. Low-risk once Phase 1 lands.
- **Desktop deprecation:** a notice in `pcedit_gui.py` + README pointing to the
  web app, optionally disabling the update check. Its own small PR — not CSS,
  kept separate so it doesn't entangle with the refactor.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Design direction | **Refined Hybrid** — clean modern utility with tasteful game flavor; pokéball-red brand accent used sparingly |
| Default theme | **Warm dark** (warm charcoal, not cold slate) |
| Light mode | **Dark default + light toggle**, persisted to `localStorage`, honoring `prefers-color-scheme` on first visit; both themes tested |
| Shell layout | **Sidebar nav** — icon + label per section, save-status bar on top, collapses to a drawer on mobile |
| Branding scope | **Inline SVG logo + full icon regen** — new pokéball + floppy-disk artwork, regenerated favicon and desktop app icons |

## Goals

1. A token-driven theme system so colors/spacing/typography live in one place.
2. Warm-dark default with a working, persisted light toggle.
3. A sidebar app shell that scales past 7 sections without crowding.
4. A deliberate **empty/first-run state** that serves as the product's front door.
5. New pokéball + floppy brand identity applied across web favicon, header logo,
   and the desktop icon set.
6. Shared layout primitives so Phase 2 tab migration is mechanical.

Non-goals: migrating the 7 tabs' internals (Phase 2), any data/logic changes,
desktop deprecation copy.

## Architecture

### 1. Design tokens (`src/app.css`)

Introduce CSS custom properties on `:root` (dark = default) with a
`:root[data-theme='light']` override block. Token families:

- **Color/surface:** `--bg`, `--surface`, `--surface-2`, `--border`,
  `--text`, `--text-muted`
- **Brand/semantic:** `--brand` (pokéball red), `--brand-contrast`,
  `--accent` (gold, used sparingly), `--danger`, `--warning`, `--success`
- **Spacing scale:** `--space-1..6`
- **Radius:** `--radius-sm`, `--radius`, `--radius-lg`
- **Typography:** `--font-sans`, `--font-mono`, font-size scale
- **Elevation:** `--shadow-sm`, `--shadow`

Warm-dark seed values (tunable): `--bg:#1b1816`, `--surface:#262220`,
`--surface-2:#2f2a26`, `--border:#38322c`, `--text:#f2ece3`,
`--text-muted:#a89f92`, `--brand:#ff5252` (brightened red for dark contrast),
`--accent:#ffc83d`.

Components reference tokens only — no raw hex in component `<style>` blocks
(enforced going forward; existing tab hex is migrated in Phase 2).

### 2. Theme engine (`src/lib/theme.svelte.ts`)

A small Svelte 5 rune-based module:

- Reads initial theme: `localStorage['theme']` → else `prefers-color-scheme`
  → else `dark`.
- Exposes reactive `theme` and `toggle()`.
- Writes `data-theme` to `document.documentElement` and persists to
  `localStorage` on change.
- A pre-hydration inline script in `index.html` sets `data-theme` before first
  paint to avoid a flash of the wrong theme (FOUC).

### 3. App shell (`src/App.svelte` + new components)

Replace the horizontal `TabsBar` with a sidebar layout:

- **`Sidebar.svelte`** — brand logo at top, vertical list of sections (icon +
  label), active item marked with a left brand-red border. Below `--mobile`
  breakpoint, collapses to a hamburger-triggered drawer (overlay).
- **`SaveBar.svelte`** — extracted/refactored from today's `TopBar`: Browse /
  Save buttons, filename, dirty indicator, status, error. Sits at top of the
  main content column. Includes the theme toggle.
- **`AppShell` layout** in `App.svelte`: CSS grid — sidebar column + main
  column (SaveBar + active tab + footer). Single source of the section list,
  shared between sidebar and the conditional tab render.
- `TabsBar.svelte` is removed; `Tab` type moves to a small `sections.ts`
  (id, label, icon).

### 4. Empty / first-run state (`src/components/EmptyState.svelte`)

Rendered in the main column when `store.data === null`. The product's front door:

- Brand logo (larger), product name.
- Primary "Browse your save…" call-to-action (reuses the file input).
- The privacy promise kept prominent: **"Your save never leaves this tab —
  everything happens in your browser."**
- Brief "what this does" line.

When a save is loaded, the active tab renders in its place.

### 5. Shared primitives (`src/components/ui/`)

Thin, token-driven building blocks so Phase 2 is mechanical:

- **`Card.svelte`** — surface + border + radius + padding container.
- **`SectionHeader.svelte`** — section title + optional description.
- **`FieldRow.svelte`** — label + control row (the dominant pattern across tabs).

Phase 1 ships these and uses them in the shell/empty state; tabs adopt them in
Phase 2.

### 6. Branding (`assets/icon/pokeball.svg`, `web/public/favicon.svg`, header)

- Author the new **pokéball + floppy-disk** SVG, replacing
  `assets/icon/pokeball.svg` (the source of truth).
- Copy/derive `web/public/favicon.svg` from the same artwork (referenced by
  `web/index.html` as `./favicon.svg`).
- Inline a compact version as the header/sidebar logo (a Svelte component or
  inline SVG) so it inherits theme colors via `currentColor` where possible.
- Run `scripts/make_icons.py` to regenerate `PCEdit.icns`, `PCEdit.ico`,
  `PCEdit-256.png`, `PCEdit-512.png` (requires ImageMagick; `.icns` step is
  macOS-only — we're on macOS). Commit the regenerated binaries.

## Data flow

No changes to data handling. `store.svelte.ts` (load/download/dirty/status)
is untouched. The shell and empty state read existing store fields
(`store.data`, `store.fileName`, `store.isDirty`, `store.status`,
`store.errorDetail`). Theme state is independent of save state.

## Error handling

Unchanged. Save-load errors continue to surface through `store.errorDetail`,
now rendered inside the restyled `SaveBar` using the `--danger` token.

## Testing

Existing 109 vitest tests import **only** from `src/lib/` (save/data/domain
logic) — verified zero DOM/component coupling. They remain a green regression
net through the restyle; the sidebar change cannot break them.

New tests (Phase 1):

- **`theme.spec.ts`** — initial resolution order (localStorage → prefers →
  dark), `toggle()` flips and persists, `data-theme` written to the root.
- **Shell render smoke test** — the section list renders all 7 sections; empty
  state shows when `store.data === null`. (Adds `@testing-library/svelte` +
  `jsdom`/`happy-dom` to devDeps — the first component test in the repo.)

Manual verification: load a real save from `../pokeclicker`, confirm both
themes, sidebar nav, mobile drawer, and the empty state. `npm run build` +
`svelte-check` clean.

## Risks

- **Low overall** — restyle + additive shell, data layer untouched, tests
  decoupled.
- **FOUC** on theme if the pre-hydration script is missed — mitigated by the
  inline `index.html` script (§2).
- **Icon regen** needs ImageMagick locally; binaries are committed so CI is
  unaffected.
- **First component test infra** (testing-library + DOM env) is new surface —
  contained to the two new test files.

## Out of scope (tracked for follow-up)

- Phase 2: migrate the 7 tabs to tokens + `ui/` primitives.
- Desktop deprecation notice + README + update-check.
- Any new editor features.
