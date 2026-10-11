// @vitest-environment happy-dom
/**
 * Underground tab: one count grid per loot category, writes through the
 * Inventory helpers (0 deletes the key), and a pointer to the tabs that edit
 * the rest of the underground loot.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'

import type { SaveData } from '../src/lib/save'
import { store } from '../src/lib/store.svelte'
import UndergroundTab from '../src/tabs/UndergroundTab.svelte'

const BONES = 749
const NEW_COUNT = 5

function itemList(): Record<string, number> {
  return (store.data!.player as { _itemList: Record<string, number> })._itemList
}
/** Keys as they'd be written to the save file (JSON), not the state proxy. */
function savedKeys(): string[] {
  return Object.keys(JSON.parse(JSON.stringify(itemList())))
}

beforeEach(() => {
  const data: SaveData = {
    player: { _itemList: { Rare_bone: BONES, Red_shard: 12 } },
    save: {},
  }
  store.data = data
})

afterEach(() => {
  store.data = null
  cleanup()
})

describe('UndergroundTab', () => {
  test('renders a section per category with current counts', () => {
    const { getByRole, getByLabelText } = render(UndergroundTab)
    for (const title of ['Treasures', 'Plates', 'Fossils', 'Special']) {
      expect(getByRole('heading', { name: title })).toBeTruthy()
    }
    expect((getByLabelText('Rare bone count') as HTMLInputElement).value).toBe(String(BONES))
    expect((getByLabelText('Helix fossil count') as HTMLInputElement).value).toBe('0')
  })

  test('does not list shards (edited on the Shards tab) and says where they are', () => {
    const { queryByLabelText, getByText } = render(UndergroundTab)
    expect(queryByLabelText('Red shard count')).toBeNull()
    expect(getByText(/Shards tab/)).toBeTruthy()
  })

  test('editing a count writes _itemList and marks the save dirty', async () => {
    store.isDirty = false
    const { getByLabelText } = render(UndergroundTab)
    const input = getByLabelText('Draco plate count') as HTMLInputElement
    await fireEvent.input(input, { target: { value: String(NEW_COUNT) } })
    await fireEvent.blur(input)
    expect(itemList().Draco_plate).toBe(NEW_COUNT)
    expect(store.isDirty).toBe(true)
  })

  test('setting a count to 0 deletes the key', async () => {
    const { getByLabelText } = render(UndergroundTab)
    const input = getByLabelText('Rare bone count') as HTMLInputElement
    await fireEvent.input(input, { target: { value: '0' } })
    await fireEvent.blur(input)
    expect(savedKeys()).not.toContain('Rare_bone')
  })

  test('"All to 100" fills one category only', async () => {
    const { getAllByRole } = render(UndergroundTab)
    // Category order: Treasures, Plates, Fossils, Special — fill Fossils.
    const fossilsFill = getAllByRole('button', { name: 'All to 100' })[2]
    await fireEvent.click(fossilsFill)
    expect(itemList().Helix_fossil).toBe(100)
    expect(itemList().Fossilized_bird).toBe(100)
    expect(itemList().Rare_bone).toBe(BONES)
    expect(savedKeys()).not.toContain('Draco_plate')
    expect(itemList().Red_shard).toBe(12)
  })
})
