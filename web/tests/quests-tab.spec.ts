// @vitest-environment happy-dom
/**
 * Quests tab component tests. Builds inline SaveData (the shared minimal
 * fixture has empty quest arrays). Checkboxes only — happy-dom lacks
 * `:checked` on <option>, so no <select bind:value>.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'

import type { SaveData } from '../src/lib/save'
import { store } from '../src/lib/store.svelte'
import QuestsTab from '../src/tabs/QuestsTab.svelte'
import realQuestSteps from '../../data/quest-steps.json'

const SAVE_VERSION = realQuestSteps.gameVersion
const NO_PROGRESS = '—'

const CANT_VERIFY = /can't verify/i
const ZERO = "Zero's Ambition"
const STARTED = 1
const ENDED = 2
const PURPLE_STEP = 4

function setSave(o: {
  questList?: unknown[]
  questLines?: unknown[]
  statistics?: object
  itemList?: object
  version?: string
}) {
  store.data = {
    player: { _itemList: o.itemList ?? {} },
    save: {
      update: { version: o.version ?? SAVE_VERSION },
      statistics: o.statistics ?? {},
      quests: { questList: o.questList ?? [], questLines: o.questLines ?? [] },
    },
  } as unknown as SaveData
  store.isDirty = false
}

const quests = () => (store.data!.save as any).quests

beforeEach(() => {
  store.data = null
})
afterEach(() => {
  store.data = null
  store.isDirty = false
  cleanup()
})

describe('QuestsTab', () => {
  test('flagged unclaimed GainMoneyQuest: Repair resets initial, marks dirty, button disappears', async () => {
    setSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 5], initial: 900, claimed: false }],
      statistics: { totalMoney: 500 },
    })
    const { getByRole, queryByRole } = render(QuestsTab)
    await fireEvent.click(getByRole('button', { name: 'Repair' }))
    expect(quests().questList[0].initial).toBe(500)
    expect(store.isDirty).toBe(true)
    expect(queryByRole('button', { name: 'Repair' })).toBeNull()
  })

  test('healthy verifiable row has no Repair button and does not dirty the store', () => {
    setSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 5], initial: 100, claimed: false }],
      statistics: { totalMoney: 500 },
    })
    const { queryByRole, getByText } = render(QuestsTab)
    expect(queryByRole('button', { name: 'Repair' })).toBeNull()
    expect(getByText('400 / 1,000')).toBeTruthy()
    expect(store.isDirty).toBe(false)
  })

  test("flagged started Zero's Ambition at step 4: Repair fixes initial", async () => {
    setSave({
      questLines: [{ name: ZERO, state: STARTED, quest: PURPLE_STEP, initial: 50 }],
      itemList: { Purple_shard: 3 },
    })
    const { getByRole, queryByRole } = render(QuestsTab)
    await fireEvent.click(getByRole('button', { name: 'Repair' }))
    expect(quests().questLines[0].initial).toBe(3)
    expect(store.isDirty).toBe(true)
    expect(queryByRole('button', { name: 'Repair' })).toBeNull()
  })

  test("unresolvable board type shows can't verify and no Repair", () => {
    setSave({ questList: [{ name: 'HatchEggsQuest', data: [10, 5], initial: 0, claimed: false }] })
    const { getByText, queryByRole } = render(QuestsTab)
    expect(getByText(CANT_VERIFY)).toBeTruthy()
    expect(queryByRole('button', { name: 'Repair' })).toBeNull()
  })

  test("claimed row shows neither can't verify nor Repair, but a dash", () => {
    setSave({
      questList: [{ name: 'GainMoneyQuest', data: [1000, 5], initial: 900, claimed: true }],
      statistics: { totalMoney: 500 },
    })
    const { queryByText, queryByRole, getByText } = render(QuestsTab)
    expect(getByText(NO_PROGRESS)).toBeTruthy()
    expect(queryByText(CANT_VERIFY)).toBeNull()
    expect(queryByRole('button', { name: 'Repair' })).toBeNull()
  })

  test('ended lines are hidden until the show-all toggle is checked', async () => {
    setSave({
      questLines: [
        { name: ZERO, state: ENDED, quest: 0, initial: 0 },
        { name: 'Other Active Line', state: STARTED, quest: 0, initial: 0 },
      ],
    })
    const { queryByText, getByLabelText } = render(QuestsTab)
    expect(queryByText(ZERO)).toBeNull()
    expect(queryByText('Other Active Line')).toBeTruthy()
    await fireEvent.click(getByLabelText(/show inactive/i))
    expect(queryByText(ZERO)).toBeTruthy()
  })

  test('unstarted board quest (initial null) shows "not started", not can\'t verify', () => {
    setSave({ questList: [{ name: 'GainMoneyQuest', data: [1000, 5], initial: null, claimed: false }] })
    const { getByText, queryByText } = render(QuestsTab)
    expect(getByText(/not started/i)).toBeTruthy()
    expect(queryByText(CANT_VERIFY)).toBeNull()
  })

  test('started line at quest index 4 renders the 1-based step "5 (CustomQuest)"', () => {
    setSave({
      questLines: [{ name: ZERO, state: STARTED, quest: PURPLE_STEP, initial: 0 }],
      itemList: { Purple_shard: 3 },
    })
    const { getByText } = render(QuestsTab)
    expect(getByText('5 (CustomQuest)')).toBeTruthy()
  })

  test('ended line shows a dash in the Step cell, not a fake step', async () => {
    setSave({ questLines: [{ name: ZERO, state: ENDED, quest: 0, initial: 0 }] })
    const { getByLabelText, queryByText, getAllByText } = render(QuestsTab)
    await fireEvent.click(getByLabelText(/show inactive/i))
    expect(queryByText(/^1 \(/)).toBeNull()
    expect(queryByText('1')).toBeNull()
    expect(getAllByText(NO_PROGRESS).length).toBeGreaterThanOrEqual(2)
  })

  test('version mismatch: note is shown and the line is not verified or repairable', () => {
    setSave({
      questLines: [{ name: ZERO, state: STARTED, quest: PURPLE_STEP, initial: 50 }],
      itemList: { Purple_shard: 3 },
      version: '0.0.1',
    })
    const { getByText, queryByRole } = render(QuestsTab)
    expect(getByText(/quest-line checks are off/i)).toBeTruthy()
    expect(getByText(new RegExp(`v${SAVE_VERSION.replace(/\./g, '\\.')}`))).toBeTruthy()
    expect(getByText(/v0\.0\.1/)).toBeTruthy()
    expect(queryByRole('button', { name: 'Repair' })).toBeNull()
  })

  test('matching version: no mismatch note', () => {
    setSave({ questLines: [{ name: ZERO, state: STARTED, quest: PURPLE_STEP, initial: 0 }] })
    const { queryByText } = render(QuestsTab)
    expect(queryByText(/quest-line checks are off/i)).toBeNull()
  })

  test('shows empty state with no save', () => {
    const { getByText } = render(QuestsTab)
    expect(getByText(/load a save/i)).toBeTruthy()
  })
})
