# PCEdit Web

Browser-based companion to the desktop PCEdit. Single-page app, no
backend. Decoding and editing happen entirely in the user's tab — saves
never upload anywhere.

This directory is intentionally narrow in scope right now:

- `src/lib/save.ts` — TypeScript port of `pokeclicker_save.py`
  (base64 + Latin-1 + dot-path get/set).
- `src/lib/latin1.ts` — helpers around the Latin-1 quirk the format
  depends on.
- `src/App.svelte` — minimal shell: pick a file, decode it, show
  enough state to confirm the round-trip works.
- `tests/save.spec.ts` — round-trip + path tests against the
  **same** fixture the Python suite reads
  (`../tests/fixtures/v0.10.25/minimal.txt`).

The tabs from the desktop editor will land here one at a time in
follow-up PRs; this skeleton just proves the toolchain works
end-to-end.

## Round-trip contract

The Python implementation guarantees byte-exact `decode → encode`
because Python preserves `int` vs `float` through `json.loads` /
`json.dumps`. JavaScript has only `number`, so `JSON.parse` collapses
`27.0` to `27` and writes it back as `27`. Real saves carry a few
float-typed integer fields (`*.durability`, `*.timeUntilDiscovery`,
…) that the game accepts in either form, so the lossy conversion is
safe — but the tests are explicit about what's actually guaranteed:

- **Byte-exact** round-trip on `tests/fixtures/v0.10.25/minimal.txt`
  (hand-built with no `.0` floats).
- **Semantic** round-trip on arbitrary saves:
  `decode(encode(decode(bytes)))` deep-equals `decode(bytes)`.

See `src/lib/save.ts` for the full note.

## Dev

```sh
cd web
npm install
npm run dev          # local dev server
npm run test         # vitest run, single pass
npm run test:watch   # vitest watch mode
npm run build        # production build → web/dist/
npm run preview      # serve the production build locally
npm run check        # svelte-check + tsc
```

## GitHub Pages deploy

`vite.config.ts` sets `base: '/pokeclicker-save-editor/'` so the
production build references assets under that subpath — which is where
GitHub Pages serves project sites (`<user>.github.io/<repo>/`).

For local builds or forks under a different repo name, override:

```sh
VITE_BASE=/ npm run build
```

The deploy workflow is added in a later PR once the SPA has enough
functionality to be worth shipping. Until then,
`.github/workflows/web-tests.yml` runs the tests and a build sanity
check on every push.
