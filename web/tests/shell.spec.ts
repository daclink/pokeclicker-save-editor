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
      'Pokédex',
    ]) {
      expect(getByText(label)).toBeTruthy()
    }
  })

  test('shows the empty state (privacy promise) when no save is loaded', () => {
    const { getByText } = render(App)
    expect(getByText(/your save never leaves this tab/i)).toBeTruthy()
  })
})
