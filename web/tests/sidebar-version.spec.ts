// @vitest-environment happy-dom
/** The sidebar shows which build is live: `v<version> · <sha>`. */
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/svelte'

import Sidebar from '../src/components/Sidebar.svelte'
import { BUILD_COMMIT_URL, BUILD_LABEL } from '../src/lib/buildInfo'

afterEach(() => cleanup())

describe('Sidebar version badge', () => {
  test('renders the build label', () => {
    const { getByText } = render(Sidebar, { props: { active: 'currencies', onSelect: () => {} } })
    expect(getByText(BUILD_LABEL)).toBeTruthy()
  })

  test('links to the commit when built from a real sha', () => {
    const { getByText } = render(Sidebar, { props: { active: 'currencies', onSelect: () => {} } })
    const el = getByText(BUILD_LABEL)
    if (BUILD_COMMIT_URL) {
      expect(el.closest('a')?.getAttribute('href')).toBe(BUILD_COMMIT_URL)
    } else {
      expect(el.closest('a')).toBeNull()
    }
  })
})
