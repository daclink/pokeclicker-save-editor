# Web Editor Redesign — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the browser save editor into a product-grade app — design tokens, warm-dark theme with a persisted light toggle, a sidebar shell, a deliberate empty/first-run state, shared UI primitives, and the new pokéball + floppy brand identity across web favicon, header logo, and desktop app icons.

**Architecture:** Additive restyle plus a shell swap. The data layer (`src/lib/store.svelte.ts`, `save.ts`, domain modules) is untouched — the existing 109 vitest tests import only from `src/lib/` and stay green as a regression net. Colors move from hardcoded hex into CSS custom properties on `:root` (dark default) with a `[data-theme='light']` override. A new rune-based `theme.svelte.ts` resolves and persists the theme. `TabsBar` is replaced by a `Sidebar` + `SaveBar` grid shell.

**Tech Stack:** Svelte 5 (runes), Vite 8, TypeScript, Vitest 4. New dev deps: `happy-dom` + `@testing-library/svelte` for the repo's first component/DOM tests (per-file `// @vitest-environment happy-dom` docblock; global env stays `node`).

**Working directory:** All paths are relative to `web/` unless they start with `assets/`, `scripts/`, or `docs/` (those are repo-root). Run all `npm` commands from `web/`.

**Branch:** `feat/web-redesign-phase1` (already created, spec committed).

---

## File Structure

**Create:**
- `web/src/lib/theme.svelte.ts` — theme resolution, toggle, persistence, `data-theme` side effect
- `web/src/lib/sections.ts` — the single source-of-truth list of editor sections (id, label, icon)
- `web/src/components/Sidebar.svelte` — nav rail + mobile drawer
- `web/src/components/SaveBar.svelte` — save status/actions + theme toggle (refactor of `TopBar`)
- `web/src/components/EmptyState.svelte` — first-run front door
- `web/src/components/Logo.svelte` — inline pokéball + floppy SVG
- `web/src/components/ui/Card.svelte`, `ui/SectionHeader.svelte`, `ui/FieldRow.svelte` — shared primitives
- `web/tests/dom-env.spec.ts` — proves the happy-dom per-file env works
- `web/tests/theme.spec.ts` — theme engine unit tests
- `web/tests/sections.spec.ts` — section-list invariants
- `web/tests/shell.spec.ts` — sidebar + empty-state render smoke test

**Modify:**
- `web/src/app.css` — design tokens + theme override block (replaces the minimal reset)
- `web/index.html` — FOUC-preventing pre-hydration theme script
- `web/src/App.svelte` — grid shell wiring (sidebar + main column)
- `web/package.json` — new dev deps
- `assets/icon/pokeball.svg` — new pokéball + floppy artwork (source of truth)
- `web/public/favicon.svg` — match the new artwork
- `assets/icon/PCEdit.{icns,ico}`, `PCEdit-{256,512}.png` — regenerated via `make_icons.py`

**Delete:**
- `web/src/components/TabsBar.svelte` — replaced by `Sidebar`

---

## Task 1: Component-test infrastructure

**Files:**
- Modify: `web/package.json`
- Create: `web/tests/dom-env.spec.ts`

- [ ] **Step 1: Install DOM test deps**

Run (from `web/`):
```bash
npm install -D happy-dom @testing-library/svelte
```
Expected: both added under `devDependencies`, no peer-dep errors (testing-library v5 supports Svelte 5).

- [ ] **Step 2: Write the env smoke test**

Create `web/tests/dom-env.spec.ts`:
```ts
// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest'

// Proves the per-file happy-dom docblock gives component/theme tests a DOM
// while the global vitest environment stays 'node' (vite.config.ts).
describe('happy-dom env', () => {
  test('document and localStorage exist', () => {
    expect(typeof document).toBe('object')
    document.documentElement.setAttribute('data-theme', 'dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    localStorage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })
})
```

- [ ] **Step 3: Bridge `localStorage` for Node ≥25 (setup file)**

Node 25 exposes a native `localStorage`/`sessionStorage` global that throws
`SecurityError` unless the process is launched with `--localstorage-file`, and
vitest's happy-dom env does not override it. Add a setup file that points the
bare globals at happy-dom's `window` storage (no-op under the `node` env, which
has no `window`).

Create `web/tests/setup-dom.ts`:
```ts
// Node ≥25 ships a native localStorage/sessionStorage global that throws
// without --localstorage-file. Under happy-dom, window has working in-memory
// storage — point the bare globals at it. No-op in the 'node' environment.
if (typeof window !== 'undefined') {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    try {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value: window[key],
      })
    } catch {
      // global not redefinable on this runtime — happy-dom's window[key]
      // is still usable directly by tests.
    }
  }
}
```

Wire it into `web/vite.config.ts` `test`:
```ts
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['tests/setup-dom.ts'],
  },
```

- [ ] **Step 4: Run it**

Run: `npm run test -- dom-env`
Expected: PASS (1 test). If `localStorage` still throws `SecurityError`, the
setup file isn't registered or `window[key]` is itself non-configurable — in
that case have the test use `window.localStorage` directly and report back.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/tests/dom-env.spec.ts web/tests/setup-dom.ts web/vite.config.ts
git commit -m "test: add happy-dom + testing-library for component tests

Adds a setup file bridging localStorage/sessionStorage for Node >=25, which
exposes a native (throwing) storage global that vitest's happy-dom env does
not override. No-op under the 'node' environment.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Theme engine

**Files:**
- Create: `web/src/lib/theme.svelte.ts`
- Test: `web/tests/theme.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `web/tests/theme.spec.ts`:
```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest'
import { ThemeStore } from '../src/lib/theme.svelte'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeStore', () => {
  test('defaults to dark when nothing stored and no light preference', () => {
    const t = new ThemeStore()
    expect(t.current).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  test('honors a stored theme over the default', () => {
    localStorage.setItem('theme', 'light')
    const t = new ThemeStore()
    expect(t.current).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  test('toggle flips, persists, and updates the root attribute', () => {
    const t = new ThemeStore()
    t.toggle()
    expect(t.current).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    t.toggle()
    expect(t.current).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  test('ignores a garbage stored value', () => {
    localStorage.setItem('theme', 'banana')
    const t = new ThemeStore()
    expect(t.current).toBe('dark')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- theme`
Expected: FAIL — cannot resolve `../src/lib/theme.svelte`.

- [ ] **Step 3: Implement the theme engine**

Create `web/src/lib/theme.svelte.ts`:
```ts
/**
 * Theme state: dark by default, with a persisted light toggle.
 *
 * Resolution order on first construction: localStorage['theme'] →
 * prefers-color-scheme: light → dark. Every change writes `data-theme` on
 * <html> (which flips the CSS token block) and persists to localStorage.
 *
 * Exported as a singleton for the app; the class is exported too so tests
 * can construct fresh instances with controlled storage/DOM.
 */
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

function resolveInitial(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  const prefersLight = window.matchMedia?.(
    '(prefers-color-scheme: light)',
  ).matches
  return prefersLight ? 'light' : 'dark'
}

export class ThemeStore {
  current = $state<Theme>('dark')

  constructor() {
    this.current = resolveInitial()
    this.apply()
  }

  toggle(): void {
    this.set(this.current === 'dark' ? 'light' : 'dark')
  }

  set(theme: Theme): void {
    this.current = theme
    localStorage.setItem(STORAGE_KEY, theme)
    this.apply()
  }

  private apply(): void {
    document.documentElement.setAttribute('data-theme', this.current)
  }
}

export const theme = new ThemeStore()
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- theme`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/theme.svelte.ts web/tests/theme.spec.ts
git commit -m "feat(web): theme engine — dark default + persisted light toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Design tokens + theme CSS

**Files:**
- Modify: `web/src/app.css`

> CSS custom-property cascade is not reliably unit-testable under happy-dom,
> so this task is verified by a clean build + svelte-check + the Task 9 visual
> pass — not a unit test. Do not invent a brittle getComputedStyle test.

- [ ] **Step 1: Replace `app.css` with the token system**

Replace the entire contents of `web/src/app.css`:
```css
/* Design tokens. Dark is the default; [data-theme='light'] overrides. */
:root {
  --font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* spacing scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;

  /* radius */
  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 14px;

  /* brand + semantic (stable across themes) */
  --brand: #ff5252;
  --brand-contrast: #1b1816;
  --accent: #ffc83d;
  --danger: #ff6b6b;
  --warning: #ffc83d;
  --success: #69db7c;

  /* dark surfaces (default) */
  --bg: #1b1816;
  --surface: #262220;
  --surface-2: #2f2a26;
  --border: #38322c;
  --text: #f2ece3;
  --text-muted: #a89f92;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.45);

  color-scheme: dark;
}

:root[data-theme='light'] {
  --bg: #faf9f7;
  --surface: #ffffff;
  --surface-2: #f3f1ed;
  --border: #e6e2da;
  --text: #1a1a1a;
  --text-muted: #6b6358;
  --brand: #ee1515;
  --brand-contrast: #ffffff;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.1);

  color-scheme: light;
}

* {
  box-sizing: border-box;
}

html {
  font-size: 16px;
  line-height: 1.5;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
}
```

- [ ] **Step 2: Verify build is clean**

Run: `npm run build`
Expected: build succeeds (existing components still reference hardcoded hex — that's fine; they get migrated in Phase 2).

- [ ] **Step 3: Commit**

```bash
git add web/src/app.css
git commit -m "feat(web): design tokens + warm-dark/light theme variables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: FOUC-preventing theme script

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: Add the pre-hydration script**

In `web/index.html`, add this `<script>` inside `<head>`, immediately before the existing `<meta name="viewport" ...>` line:
```html
    <script>
      // Set the theme attribute before first paint to avoid a flash of the
      // wrong theme. Mirrors resolveInitial() in src/lib/theme.svelte.ts.
      ;(function () {
        try {
          var s = localStorage.getItem('theme')
          var t =
            s === 'dark' || s === 'light'
              ? s
              : window.matchMedia('(prefers-color-scheme: light)').matches
                ? 'light'
                : 'dark'
          document.documentElement.setAttribute('data-theme', t)
        } catch (e) {
          document.documentElement.setAttribute('data-theme', 'dark')
        }
      })()
    </script>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. Then `npm run dev`, open the app, confirm no light-flash on load (dark by default).

- [ ] **Step 3: Commit**

```bash
git add web/index.html
git commit -m "feat(web): set data-theme before first paint to avoid FOUC

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Section list

**Files:**
- Create: `web/src/lib/sections.ts`
- Test: `web/tests/sections.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `web/tests/sections.spec.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { SECTIONS } from '../src/lib/sections'

describe('SECTIONS', () => {
  test('lists the seven editor sections in order', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      'currencies',
      'eggs',
      'shards',
      'gems',
      'flutes',
      'berries',
      'caught',
    ])
  })

  test('every section has a non-empty label and icon', () => {
    for (const s of SECTIONS) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.icon.length).toBeGreaterThan(0)
    }
  })

  test('ids are unique', () => {
    const ids = SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- sections`
Expected: FAIL — cannot resolve `../src/lib/sections`.

- [ ] **Step 3: Implement the section list**

Create `web/src/lib/sections.ts`:
```ts
/** Single source of truth for the editor's sections (sidebar + router). */
export type SectionId =
  | 'currencies'
  | 'eggs'
  | 'shards'
  | 'gems'
  | 'flutes'
  | 'berries'
  | 'caught'

export type Section = {
  id: SectionId
  label: string
  /** Emoji glyph shown in the sidebar rail. */
  icon: string
}

export const SECTIONS: readonly Section[] = [
  { id: 'currencies', label: 'Currencies & Multipliers', icon: '💰' },
  { id: 'eggs', label: 'Eggs', icon: '🥚' },
  { id: 'shards', label: 'Shards', icon: '🔷' },
  { id: 'gems', label: 'Gems', icon: '💎' },
  { id: 'flutes', label: 'Flutes', icon: '🎵' },
  { id: 'berries', label: 'Berries', icon: '🫐' },
  { id: 'caught', label: 'Caught Pokémon', icon: '⛺' },
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- sections`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sections.ts web/tests/sections.spec.ts
git commit -m "feat(web): section list as single source of truth

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Shared UI primitives

**Files:**
- Create: `web/src/components/ui/Card.svelte`
- Create: `web/src/components/ui/SectionHeader.svelte`
- Create: `web/src/components/ui/FieldRow.svelte`

> These are token-driven, snippet-based layout shells. Phase 1 ships them as
> foundation; they are **adopted by the tabs in Phase 2**, so nothing imports
> them yet. Verify they compile with a clean `svelte-check` + build — not a
> per-file unit test, and not via the shell test (which doesn't use them).

- [ ] **Step 1: Create `Card.svelte`**

`web/src/components/ui/Card.svelte`:
```svelte
<script lang="ts">
  // Surface container: the standard panel used across the app.
  import type { Snippet } from 'svelte'
  let { children }: { children: Snippet } = $props()
</script>

<div class="card">
  {@render children()}
</div>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-4);
    box-shadow: var(--shadow-sm);
  }
</style>
```

- [ ] **Step 2: Create `SectionHeader.svelte`**

`web/src/components/ui/SectionHeader.svelte`:
```svelte
<script lang="ts">
  // Title + optional description at the top of a section.
  let { title, description }: { title: string; description?: string } =
    $props()
</script>

<header class="section-header">
  <h2>{title}</h2>
  {#if description}<p>{description}</p>{/if}
</header>

<style>
  .section-header {
    margin-bottom: var(--space-4);
  }
  .section-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text);
  }
  .section-header p {
    margin: var(--space-1) 0 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
</style>
```

- [ ] **Step 3: Create `FieldRow.svelte`**

`web/src/components/ui/FieldRow.svelte`:
```svelte
<script lang="ts">
  // Label + control row — the dominant editing pattern across tabs.
  import type { Snippet } from 'svelte'
  let {
    label,
    children,
  }: { label: string; children: Snippet } = $props()
</script>

<label class="field-row">
  <span class="label">{label}</span>
  <span class="control">{@render children()}</span>
</label>

<style>
  .field-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border);
  }
  .field-row:last-child {
    border-bottom: none;
  }
  .label {
    color: var(--text);
    font-size: 0.9rem;
  }
  .control {
    font-family: var(--font-mono);
  }
</style>
```

- [ ] **Step 4: Verify svelte-check + build**

Run: `npm run build`
Expected: succeeds. (svelte-check runs as part of build via `svelte-check` if configured; otherwise run `npx svelte-check` and expect 0 errors.)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui/
git commit -m "feat(web): shared UI primitives (Card, SectionHeader, FieldRow)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Logo, Sidebar, SaveBar, EmptyState components

**Files:**
- Create: `web/src/components/Logo.svelte`
- Create: `web/src/components/Sidebar.svelte`
- Create: `web/src/components/SaveBar.svelte`
- Create: `web/src/components/EmptyState.svelte`

- [ ] **Step 1: Create `Logo.svelte`**

`web/src/components/Logo.svelte` — a floppy disk with a pokéball on its label. Brand colors are intrinsic (red/white/dark); `size` scales it.
```svelte
<script lang="ts">
  let { size = 24 }: { size?: number } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 32 32"
  role="img"
  aria-label="PokéSave Editor logo"
  xmlns="http://www.w3.org/2000/svg"
>
  <!-- floppy body -->
  <path
    d="M5 3h18l4 4v22a0 0 0 0 1 0 0H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
    fill="#2f2a26"
    stroke="#f2ece3"
    stroke-width="1.5"
  />
  <!-- top shutter -->
  <rect x="9" y="3" width="12" height="7" rx="1" fill="#f2ece3" />
  <rect x="16" y="4" width="3" height="5" fill="#8a8178" />
  <!-- pokéball label -->
  <circle cx="16" cy="20" r="6.5" fill="#fff" stroke="#1a1a1a" stroke-width="1.2" />
  <path d="M9.7 20a6.5 6.5 0 0 1 12.6 0z" fill="#ee1515" stroke="#1a1a1a" stroke-width="1.2" />
  <line x1="9.5" y1="20" x2="22.5" y2="20" stroke="#1a1a1a" stroke-width="1.2" />
  <circle cx="16" cy="20" r="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.2" />
</svg>
```

- [ ] **Step 2: Create `Sidebar.svelte`**

`web/src/components/Sidebar.svelte`:
```svelte
<script lang="ts">
  // Vertical nav rail. Brand logo on top, one row per section. Below the
  // mobile breakpoint it collapses behind a hamburger into an overlay drawer.
  import Logo from './Logo.svelte'
  import { SECTIONS, type SectionId } from '../lib/sections'

  let {
    active,
    onSelect,
  }: { active: SectionId; onSelect: (id: SectionId) => void } = $props()

  let open = $state(false)

  function pick(id: SectionId): void {
    onSelect(id)
    open = false
  }
</script>

<button
  class="hamburger"
  type="button"
  aria-label="Toggle navigation"
  aria-expanded={open}
  onclick={() => (open = !open)}
>
  ☰
</button>

<nav class="sidebar" class:open aria-label="Editor sections">
  <div class="brand">
    <Logo size={26} />
    <span class="wordmark">PokéSave <span class="dim">Editor</span></span>
  </div>
  <ul>
    {#each SECTIONS as s (s.id)}
      <li>
        <button
          type="button"
          class="item"
          class:active={active === s.id}
          aria-current={active === s.id ? 'page' : undefined}
          onclick={() => pick(s.id)}
        >
          <span class="icon" aria-hidden="true">{s.icon}</span>
          <span class="text">{s.label}</span>
        </button>
      </li>
    {/each}
  </ul>
</nav>

{#if open}
  <button
    class="scrim"
    type="button"
    aria-label="Close navigation"
    onclick={() => (open = false)}
  ></button>
{/if}

<style>
  .sidebar {
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: var(--space-4) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2);
  }
  .wordmark {
    font-weight: 700;
    color: var(--text);
    font-size: 0.95rem;
  }
  .dim {
    color: var(--text-muted);
    font-weight: 500;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
  }
  .item:hover:not(.active) {
    background: var(--surface-2);
    color: var(--text);
  }
  .item.active {
    background: var(--surface-2);
    color: var(--text);
    border-left-color: var(--brand);
    font-weight: 600;
  }
  .icon {
    width: 1.2em;
    text-align: center;
  }
  .hamburger {
    display: none;
    position: fixed;
    top: var(--space-3);
    left: var(--space-3);
    z-index: 30;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    font-size: 1rem;
    cursor: pointer;
  }
  .scrim {
    display: none;
  }

  @media (max-width: 720px) {
    .hamburger {
      display: block;
    }
    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 25;
      transform: translateX(-100%);
      transition: transform 0.18s ease;
      box-shadow: var(--shadow);
    }
    .sidebar.open {
      transform: translateX(0);
    }
    .scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 20;
      border: none;
      background: rgba(0, 0, 0, 0.5);
      cursor: pointer;
    }
  }
</style>
```

- [ ] **Step 3: Create `SaveBar.svelte`** (refactor of `TopBar`, tokens + theme toggle)

`web/src/components/SaveBar.svelte`:
```svelte
<script lang="ts">
  // Save status + actions, top of the main column. Browse downloads a fresh
  // .txt (the browser can't write the original in place). Includes the theme
  // toggle. Refactor of the old TopBar, now token-driven.
  import { store } from '../lib/store.svelte'
  import { theme } from '../lib/theme.svelte'

  function onPick(evt: Event): void {
    const input = evt.target as HTMLInputElement
    if (input.files?.[0]) void store.load(input.files[0])
    input.value = ''
  }
</script>

<div class="savebar">
  <div class="left">
    <label class="button primary">
      <input type="file" accept=".txt" onchange={onPick} />
      Browse…
    </label>
    <button
      type="button"
      class="button"
      onclick={() => store.download()}
      disabled={store.data === null}
    >
      Save (download)
    </button>
    <span class="file">{store.fileName ?? '(no file)'}</span>
    {#if store.isDirty}<span class="dirty">● unsaved</span>{/if}
  </div>
  <button
    type="button"
    class="button theme"
    aria-label="Toggle light/dark theme"
    onclick={() => theme.toggle()}
  >
    {theme.current === 'dark' ? '☾' : '☀'}
  </button>
</div>

{#if store.status}<p class="status">{store.status}</p>{/if}
{#if store.errorDetail}<pre class="error">{store.errorDetail}</pre>{/if}

<style>
  .savebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  .left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 0.9rem;
  }
  .button:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .button:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }
  .button.primary {
    background: var(--brand);
    color: var(--brand-contrast);
    border-color: var(--brand);
    font-weight: 600;
  }
  .button input[type='file'] {
    display: none;
  }
  .theme {
    padding: var(--space-2) var(--space-3);
  }
  .file {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.85rem;
  }
  .dirty {
    color: var(--warning);
    font-size: 0.85rem;
  }
  .status {
    margin: var(--space-2) 0 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .error {
    margin: var(--space-2) 0 0;
    padding: var(--space-2);
    background: color-mix(in srgb, var(--danger) 15%, transparent);
    color: var(--danger);
    white-space: pre-wrap;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
  }
</style>
```

- [ ] **Step 4: Create `EmptyState.svelte`**

`web/src/components/EmptyState.svelte`:
```svelte
<script lang="ts">
  // First-run front door, shown when no save is loaded. Leads with the
  // privacy promise — for a save editor, that IS the pitch.
  import Logo from './Logo.svelte'
  import { store } from '../lib/store.svelte'

  function onPick(evt: Event): void {
    const input = evt.target as HTMLInputElement
    if (input.files?.[0]) void store.load(input.files[0])
    input.value = ''
  }
</script>

<div class="empty">
  <Logo size={64} />
  <h1>PokéSave Editor</h1>
  <p class="lead">Edit your PokeClicker save — Pokédollars, eggs, shards, gems, flutes, berries, and your caught Pokémon.</p>
  <label class="cta">
    <input type="file" accept=".txt" onchange={onPick} />
    Browse your save…
  </label>
  <p class="privacy">
    🔒 Your save never leaves this tab — everything happens in your browser.
  </p>
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-4);
    max-width: 30rem;
    margin: 0 auto;
  }
  .empty h1 {
    margin: var(--space-2) 0 0;
    font-size: 1.6rem;
    color: var(--text);
  }
  .lead {
    margin: 0;
    color: var(--text-muted);
  }
  .cta {
    margin-top: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: var(--brand);
    color: var(--brand-contrast);
    border-radius: var(--radius);
    font-weight: 700;
    cursor: pointer;
  }
  .cta input[type='file'] {
    display: none;
  }
  .privacy {
    margin-top: var(--space-2);
    color: var(--text-muted);
    font-size: 0.85rem;
  }
</style>
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds (components are not yet wired into `App.svelte`; that's Task 8).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Logo.svelte web/src/components/Sidebar.svelte web/src/components/SaveBar.svelte web/src/components/EmptyState.svelte
git commit -m "feat(web): Logo, Sidebar, SaveBar, EmptyState components

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Wire the shell + delete TabsBar

**Files:**
- Modify: `web/src/App.svelte`
- Delete: `web/src/components/TabsBar.svelte`
- Test: `web/tests/shell.spec.ts`

- [ ] **Step 1: Write the failing shell test**

Create `web/tests/shell.spec.ts`:
```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/svelte'
import App from '../src/App.svelte'

afterEach(cleanup)

describe('App shell', () => {
  test('renders a sidebar item for every section', () => {
    const { getByText } = render(App)
    for (const label of [
      'Currencies & Multipliers',
      'Eggs',
      'Shards',
      'Gems',
      'Flutes',
      'Berries',
      'Caught Pokémon',
    ]) {
      expect(getByText(label)).toBeTruthy()
    }
  })

  test('shows the empty state (privacy promise) when no save is loaded', () => {
    const { getByText } = render(App)
    expect(
      getByText(/your save never leaves this tab/i),
    ).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- shell`
Expected: FAIL — `App` still renders the old `TabsBar`/header; the privacy text and/or some sidebar labels are absent, or render throws on the not-yet-updated structure.

- [ ] **Step 3: Rewrite `App.svelte` as the grid shell**

Replace the entire contents of `web/src/App.svelte`:
```svelte
<script lang="ts">
  // App shell: sidebar nav + main column (save bar, active section, footer).
  // Sections render conditionally — unmounting on switch keeps per-tab state
  // (open dialogs, drafts) from leaking across.
  import Sidebar from './components/Sidebar.svelte'
  import SaveBar from './components/SaveBar.svelte'
  import EmptyState from './components/EmptyState.svelte'
  import { store } from './lib/store.svelte'
  import { SECTIONS, type SectionId } from './lib/sections'

  import CurrenciesTab from './tabs/CurrenciesTab.svelte'
  import EggsTab from './tabs/EggsTab.svelte'
  import ShardsTab from './tabs/ShardsTab.svelte'
  import GemsTab from './tabs/GemsTab.svelte'
  import FlutesTab from './tabs/FlutesTab.svelte'
  import BerriesTab from './tabs/BerriesTab.svelte'
  import CaughtTab from './tabs/CaughtTab.svelte'

  let active = $state<SectionId>(SECTIONS[0].id)
</script>

<div class="app">
  <Sidebar {active} onSelect={(id) => (active = id)} />

  <main>
    <SaveBar />

    {#if store.data === null}
      <EmptyState />
    {:else if active === 'currencies'}
      <CurrenciesTab />
    {:else if active === 'eggs'}
      <EggsTab />
    {:else if active === 'shards'}
      <ShardsTab />
    {:else if active === 'gems'}
      <GemsTab />
    {:else if active === 'flutes'}
      <FlutesTab />
    {:else if active === 'berries'}
      <BerriesTab />
    {:else if active === 'caught'}
      <CaughtTab />
    {/if}

    <footer>
      <p>
        Source: <a
          href="https://github.com/daclink/pokeclicker-save-editor"
          target="_blank"
          rel="noreferrer">github.com/daclink/pokeclicker-save-editor</a
        >. Use at your own risk.
      </p>
    </footer>
  </main>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: minmax(180px, 230px) 1fr;
    min-height: 100vh;
  }
  main {
    padding: var(--space-5);
    max-width: 860px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  footer {
    margin-top: auto;
    padding-top: var(--space-5);
    color: var(--text-muted);
    font-size: 0.8rem;
    text-align: center;
  }
  footer a {
    color: inherit;
  }

  @media (max-width: 720px) {
    .app {
      grid-template-columns: 1fr;
    }
    main {
      padding: var(--space-5) var(--space-4);
      padding-top: var(--space-6);
    }
  }
</style>
```

- [ ] **Step 4: Delete the old TabsBar**

Run: `git rm web/src/components/TabsBar.svelte`
Expected: file removed. (Confirm nothing else imports it: `grep -rn TabsBar web/src` returns nothing.)

- [ ] **Step 5: Run shell test + full suite**

Run: `npm run test -- shell` → Expected: PASS (2 tests).
Run: `npm run test` → Expected: all pass (109 existing + dom-env + theme×4 + sections×3 + shell×2).

- [ ] **Step 6: Verify build + svelte-check**

Run: `npm run build`
Expected: succeeds, 0 svelte-check errors. Then `npm run dev` and confirm: sidebar nav switches sections, empty state shows on first load, theme toggle flips dark/light, mobile width (<720px) shows the hamburger + drawer.

- [ ] **Step 7: Commit**

```bash
git add web/src/App.svelte web/tests/shell.spec.ts
git rm --cached web/src/components/TabsBar.svelte 2>/dev/null || true
git commit -m "feat(web): sidebar shell + empty state; remove TabsBar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Brand artwork + icon regeneration

**Files:**
- Modify: `assets/icon/pokeball.svg` (repo root)
- Modify: `web/public/favicon.svg`
- Regenerate: `assets/icon/PCEdit.{icns,ico}`, `PCEdit-{256,512}.png`

> This is the visual finishing pass. The placeholder artwork below is a clean
> starting point; refine it in the visual companion before regenerating icons
> if desired. Verified by build + eyeballing, not a unit test.

- [ ] **Step 1: Confirm ImageMagick is available**

Run: `which magick`
Expected: a path. If missing: `brew install imagemagick`, then re-run.

- [ ] **Step 2: Replace `assets/icon/pokeball.svg`** with the pokéball + floppy artwork

Write `assets/icon/pokeball.svg` (repo root) — a larger, standalone version of the `Logo.svelte` mark on a transparent background, sized 1024 for crisp rasterisation:
```xml
<svg width="1024" height="1024" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 3h18l4 4v22a0 0 0 0 1 0 0H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#2f2a26" stroke="#f2ece3" stroke-width="1.5"/>
  <rect x="9" y="3" width="12" height="7" rx="1" fill="#f2ece3"/>
  <rect x="16" y="4" width="3" height="5" fill="#8a8178"/>
  <circle cx="16" cy="20" r="6.5" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <path d="M9.7 20a6.5 6.5 0 0 1 12.6 0z" fill="#ee1515" stroke="#1a1a1a" stroke-width="1.2"/>
  <line x1="9.5" y1="20" x2="22.5" y2="20" stroke="#1a1a1a" stroke-width="1.2"/>
  <circle cx="16" cy="20" r="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
</svg>
```

- [ ] **Step 3: Match the web favicon**

Copy the same artwork to `web/public/favicon.svg`:
```bash
cp assets/icon/pokeball.svg web/public/favicon.svg
```

- [ ] **Step 4: Regenerate the desktop icon set**

Run (from repo root): `python3 scripts/make_icons.py`
Expected: regenerates `PCEdit.icns`, `PCEdit.ico`, `PCEdit-256.png`, `PCEdit-512.png` with the new artwork, no errors (macOS, so the `.icns` step runs).

- [ ] **Step 5: Verify**

Run (from `web/`): `npm run build` → succeeds. Open `web/dist/index.html` or `npm run dev` and confirm the browser tab favicon is the new mark. Eyeball `assets/icon/PCEdit-256.png`.

- [ ] **Step 6: Commit**

```bash
git add assets/icon/pokeball.svg assets/icon/PCEdit.icns assets/icon/PCEdit.ico assets/icon/PCEdit-256.png assets/icon/PCEdit-512.png web/public/favicon.svg
git commit -m "feat: pokeball+floppy brand artwork; regenerate favicon + app icons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run (from `web/`): `npm run test`
Expected: all pass — 109 existing + dom-env(1) + theme(4) + sections(3) + shell(2) = 119.

- [ ] **Step 2: Build + type check**

Run: `npm run build`
Expected: succeeds with 0 errors. If `svelte-check` is not part of `build`, also run `npx svelte-check` and expect 0 errors.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`, then verify against a real save from `../pokeclicker`:
- [ ] Empty state shows on first load, privacy line visible
- [ ] Browse loads a save; the active section renders
- [ ] Sidebar switches all 7 sections; active item shows the red left border
- [ ] Save (download) produces a `.txt`; dirty dot appears after an edit
- [ ] Theme toggle flips dark ↔ light and persists across reload (no FOUC)
- [ ] At <720px width: hamburger opens the drawer; picking a section closes it
- [ ] Favicon in the browser tab is the new pokéball + floppy mark

- [ ] **Step 4: Update CHANGELOG**

Open `CHANGELOG.md`, match the existing heading style, and add this entry to the top unreleased section (create an `## [Unreleased]` section if none exists):
```markdown
### Added
- Web editor redesign (Phase 1): design-token theme system, warm-dark default
  with a persisted light/dark toggle, sidebar navigation shell with a mobile
  drawer, and a first-run empty state leading with the client-side privacy
  promise.
- New pokéball + floppy-disk brand mark applied to the in-app logo, web
  favicon, and regenerated desktop app icons.
```
Commit:
```bash
git add CHANGELOG.md
git commit -m "docs: changelog for web editor Phase 1 redesign

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/web-redesign-phase1
gh pr create --title "Web editor Phase 1: product redesign (tokens, theme, sidebar, brand)" --body "$(cat <<'EOF'
## Summary
- Design tokens replace hardcoded hex; warm-dark default + persisted light toggle
- Sidebar app shell (mobile drawer) replaces the horizontal tab strip
- Deliberate empty/first-run state leading with the privacy promise
- New pokéball + floppy brand: header logo, web favicon, regenerated desktop icons
- Shared UI primitives (Card, SectionHeader, FieldRow) for Phase 2 tab migration

## Test Plan
- [ ] `npm run test` — 119 tests pass (109 existing + theme/sections/shell/env)
- [ ] `npm run build` + `svelte-check` clean
- [ ] Manual: empty state, section switching, theme persistence (no FOUC), mobile drawer, favicon

Phase 2 (tab internals migration) and desktop deprecation are tracked separately.
EOF
)"
```

---

## Notes for the executor

- **Don't migrate tab internals.** Tabs keep their current hardcoded styles in Phase 1 — they'll look slightly off against the new shell, which is expected and fixed in Phase 2. Only the shell, theme, empty state, and brand are in scope here.
- **Per-file DOM env:** any test that touches `document`, `localStorage`, or renders a component MUST start with `// @vitest-environment happy-dom`. The global env stays `node` for the fast data tests.
- **Tokens only in new code:** new components reference `var(--token)`, never raw hex (except the brand SVG, where red/white/dark are intrinsic).
