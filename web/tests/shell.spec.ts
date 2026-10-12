// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tick } from 'svelte'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'
import App from '../src/App.svelte'
import { store } from '../src/lib/store.svelte'

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')
const fixtureText = () => readFileSync(FIXTURE, 'utf8').trim()

afterEach(() => {
  store.data = null
  store.fileName = null
  store.isDirty = false
  cleanup()
})

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
      'Underground',
      'Caught Pokémon',
      'Pokédex',
      'Quests',
    ]) {
      expect(getByText(label)).toBeTruthy()
    }
  })

  test('shows the empty state (privacy promise) when no save is loaded', () => {
    const { getByText } = render(App)
    expect(getByText(/your save never leaves this tab/i)).toBeTruthy()
  })
})

describe('store.loadId', () => {
  test('increments on every successful load', async () => {
    const before = store.loadId
    await store.load(new File([fixtureText()], 'a.txt'))
    expect(store.loadId).toBe(before + 1)
    await store.load(new File([fixtureText()], 'a.txt'))
    expect(store.loadId).toBe(before + 2)
  })

  test('does not change when a load fails to decode', async () => {
    await store.load(new File([fixtureText()], 'a.txt'))
    const before = store.loadId
    await store.load(new File(['not a save'], 'bad.txt'))
    expect(store.loadId).toBe(before)
    expect(store.data).not.toBeNull()
  })
})

describe('loading a different save', () => {
  test('clears the Caught tab selection', async () => {
    const { getByText, getByLabelText } = render(App)
    await store.load(new File([fixtureText()], 'a.txt'))
    await tick()
    await fireEvent.click(getByText('Caught Pokémon'))
    await fireEvent.click(getByLabelText('Select Pikachu'))
    expect((getByLabelText('Select Pikachu') as HTMLInputElement).checked).toBe(true)
    expect(getByText('1 selected')).toBeTruthy()

    await store.load(new File([fixtureText()], 'b.txt'))
    await tick()
    // Re-query: the tab remounted, so the old checkbox node is gone.
    expect((getByLabelText('Select Pikachu') as HTMLInputElement).checked).toBe(false)
  })

  test('clears the Pokédex selection', async () => {
    const { getByText, getByLabelText } = render(App)
    await store.load(new File([fixtureText()], 'a.txt'))
    await tick()
    await fireEvent.click(getByText('Pokédex'))
    const box = getByLabelText("Select Bulbasaur") as HTMLInputElement
    await fireEvent.click(box)
    expect((getByLabelText("Select Bulbasaur") as HTMLInputElement).checked).toBe(true)

    await store.load(new File([fixtureText()], 'b.txt'))
    await tick()
    expect((getByLabelText("Select Bulbasaur") as HTMLInputElement).checked).toBe(false)
  })
})

describe('beforeunload guard', () => {
  const fireUnload = () => {
    const evt = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(evt)
    return evt
  }

  test('prompts when there are unsaved edits', () => {
    render(App)
    store.isDirty = true
    expect(fireUnload().defaultPrevented).toBe(true)
  })

  test('does not prompt when the save is clean', () => {
    render(App)
    store.isDirty = false
    expect(fireUnload().defaultPrevented).toBe(false)
  })

  test('the listener is removed when the app unmounts', () => {
    const { unmount } = render(App)
    unmount()
    store.isDirty = true
    expect(fireUnload().defaultPrevented).toBe(false)
  })
})
