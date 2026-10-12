// @vitest-environment happy-dom
/**
 * Flutes tab: active flutes (in `player.effectList`) show as owned with an
 * "Active" badge, a duplicate warning offers to drop the extra copy, and
 * the buttons follow the lib's active-aware write rules.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'

import type { SaveData } from '../src/lib/save'
import { store } from '../src/lib/store.svelte'
import FlutesTab from '../src/tabs/FlutesTab.svelte'

/** Gem budget of a running flute. */
const BUDGET = 1000
const X_ATTACK_SECONDS = 30
const ACTIVE_NOTE = 'Active flutes are in use; removing one also turns it off.'

type Bag = Record<string, unknown>
const player = () => store.data!.player as { _itemList: Bag; effectList: Bag }
/** As written to the save file (JSON), not the state proxy. */
const saved = (bag: Bag) => JSON.parse(JSON.stringify(bag)) as Bag

beforeEach(() => {
  const data: SaveData = {
    player: {
      _itemList: { Black_Flute: 1 },
      effectList: { Yellow_Flute: BUDGET, xAttack: X_ATTACK_SECONDS },
    },
    save: {},
  }
  store.data = data
})

afterEach(() => {
  store.data = null
  cleanup()
})

describe('FlutesTab', () => {
  test('active flute is checked and badged; owned is checked without badge', () => {
    const { getByLabelText, getByText, getAllByText } = render(FlutesTab)
    expect((getByLabelText(/Yellow Flute/) as HTMLInputElement).checked).toBe(true)
    expect((getByLabelText(/Black Flute/) as HTMLInputElement).checked).toBe(true)
    expect((getByLabelText(/Time Flute/) as HTMLInputElement).checked).toBe(false)
    expect(getAllByText('Active')).toHaveLength(1)
    expect(getByText(ACTIVE_NOTE)).toBeTruthy()
  })

  test('unchecking an active flute removes it and turns it off', async () => {
    const { getByLabelText, queryAllByText } = render(FlutesTab)
    await fireEvent.click(getByLabelText(/Yellow Flute/))
    expect(saved(player().effectList)).toEqual({ xAttack: X_ATTACK_SECONDS })
    expect('Yellow_Flute' in saved(player()._itemList)).toBe(false)
    expect(queryAllByText('Active')).toHaveLength(0)
    expect(store.isDirty).toBe(true)
  })

  test('Give all does not add a copy of the active flute', async () => {
    const { getByRole } = render(FlutesTab)
    await fireEvent.click(getByRole('button', { name: 'Give all' }))
    const items = saved(player()._itemList)
    expect('Yellow_Flute' in items).toBe(false)
    expect(items.Time_Flute).toBe(1)
    expect(saved(player().effectList).Yellow_Flute).toBe(BUDGET)
  })

  test('no duplicate warning on a clean save', () => {
    const { queryByRole } = render(FlutesTab)
    expect(queryByRole('button', { name: /remove extra copies/i })).toBeNull()
  })

  test('duplicate warning names the flute and repairs on click', async () => {
    player()._itemList.Yellow_Flute = 1
    const { getByRole, getByText, queryByRole } = render(FlutesTab)
    expect(getByText(/Yellow Flute is active and also in your items/)).toBeTruthy()
    await fireEvent.click(getByRole('button', { name: /remove extra copies/i }))
    expect('Yellow_Flute' in saved(player()._itemList)).toBe(false)
    expect(saved(player().effectList).Yellow_Flute).toBe(BUDGET)
    expect(queryByRole('button', { name: /remove extra copies/i })).toBeNull()
  })
})
