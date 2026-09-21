import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

// Guard for the Phase 2 tab migration: once a component is migrated to the
// design tokens in `src/app.css`, its <style> block must not reintroduce raw
// colors. Hardcoded light backgrounds were the root cause of the
// "unreadable in dark mode" bug (light --text inherited onto #fafafa/white).
//
// Add a file here when its migration lands; the list grows until it covers
// every tab, at which point it can become a glob.
const MIGRATED_COMPONENTS = [
  'src/tabs/BerriesTab.svelte',
  'src/components/SimpleIntDialog.svelte',
  'src/tabs/InventoryTab.svelte',
  'src/components/ItemCountGrid.svelte',
  'src/tabs/CaughtTab.svelte',
  'src/components/NumberField.svelte',
  'src/tabs/CurrenciesTab.svelte',
  'src/tabs/EggsTab.svelte',
] as const

const WEB_ROOT = resolve(__dirname, '..')

/** Raw color literals: hex, rgb()/hsl() functions, and named colors we've
 *  actually seen in un-migrated tabs. `transparent`/`inherit`/`currentColor`
 *  are theme-neutral and allowed. */
const RAW_COLOR_PATTERNS: readonly RegExp[] = [
  /#[0-9a-fA-F]{3,8}\b/,
  /\b(?:rgb|rgba|hsl|hsla)\(/,
  /:\s*(?:white|black|gray|grey|silver)\b/,
]

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

  for (const file of MIGRATED_COMPONENTS) {
    test(`${file} uses only design tokens for color`, () => {
      const css = styleBlock(file)
      expect(css.length).toBeGreaterThan(0)
      expect(rawColorLines(css)).toEqual([])
    })
  }
})
