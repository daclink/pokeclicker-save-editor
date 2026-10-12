import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

// Every component's <style> block must use the design tokens in
// `src/app.css` for color — no raw hex/rgb/named colors. Hardcoded light
// backgrounds were the root cause of the "unreadable in dark mode" bug
// (light --text inherited onto #fafafa/white). The Phase 2 migration
// finished with Shards, Gems, Flutes, Pokédex and the Sidebar scrim, so the
// guard now covers every .svelte file, including ones added later.
const COMPONENT_EXT = '.svelte'
const SRC_DIR = 'src'

const WEB_ROOT = resolve(__dirname, '..')

/** Raw color literals: hex, rgb()/hsl() functions, and named colors we've
 *  actually seen in un-migrated tabs. `transparent`/`inherit`/`currentColor`
 *  are theme-neutral and allowed. */
const RAW_COLOR_PATTERNS: readonly RegExp[] = [
  /#[0-9a-fA-F]{3,8}\b/,
  /\b(?:rgb|rgba|hsl|hsla)\(/,
  /:\s*(?:white|black|gray|grey|silver)\b/,
]

/** Every component under src/, as paths relative to the web root. */
function allComponents(): string[] {
  return readdirSync(resolve(WEB_ROOT, SRC_DIR), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(COMPONENT_EXT))
    .map((f) => `${SRC_DIR}/${f}`)
    .sort()
}

function styleBlock(relPath: string): string {
  const src = readFileSync(resolve(WEB_ROOT, relPath), 'utf8')
  const match = src.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  return match ? match[1] : ''
}

function rawColorLines(css: string): string[] {
  return css
    .split('\n')
    .filter((line) => RAW_COLOR_PATTERNS.some((re) => re.test(line)))
    .map((line) => line.trim())
}

describe('design-token guard', () => {
  test('detector flags raw colors (sanity check on the patterns)', () => {
    expect(rawColorLines('  background: #fafafa;')).toHaveLength(1)
    expect(rawColorLines('  background: white;')).toHaveLength(1)
    expect(rawColorLines('  color: rgba(0, 0, 0, 0.5);')).toHaveLength(1)
    expect(rawColorLines('  background: var(--surface);')).toHaveLength(0)
    expect(rawColorLines('  background: transparent;')).toHaveLength(0)
    // `white-space` must not be mistaken for the color `white`.
    expect(rawColorLines('  white-space: nowrap;')).toHaveLength(0)
  })

  test('finds the components (guards against an empty glob)', () => {
    const files = allComponents()
    expect(files).toContain('src/App.svelte')
    expect(files).toContain('src/tabs/PokedexTab.svelte')
    expect(files).toContain('src/components/Sidebar.svelte')
  })

  for (const file of allComponents()) {
    test(`${file} uses only design tokens for color`, () => {
      expect(rawColorLines(styleBlock(file))).toEqual([])
    })
  }
})
