// @vitest-environment happy-dom
/**
 * Pokédex tab filter box and sortable ID/Name headers. Fixture has exactly
 * Charmander (#4) and Pikachu (#25) caught; Kanto is the default region.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'

import { decodeBytes } from '../src/lib/save'
import { caughtIdSet } from '../src/lib/pokedex'
import { store } from '../src/lib/store.svelte'
import PokedexTab from '../src/tabs/PokedexTab.svelte'

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')
const FILTER = /Filter by name or #/
const MARK_SELECTED = /Mark selected caught/

/** The ID cells of the visible table rows, in display order. */
function shownIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll('tbody tr td:nth-child(2)')].map((td) => td.textContent ?? '')
}

beforeEach(() => {
  store.data = decodeBytes(readFileSync(FIXTURE, 'utf8').trim())
})

afterEach(() => {
  store.data = null
  cleanup()
})

describe('PokedexTab filter', () => {
  test('typing a name narrows the rows', async () => {
    const { getByLabelText, container } = render(PokedexTab)
    await fireEvent.input(getByLabelText(FILTER), { target: { value: 'saur' } })
    expect(shownIds(container)).toEqual(['#1', '#2', '#3'])
  })

  test('typing an id shows that species', async () => {
    const { getByLabelText, container } = render(PokedexTab)
    await fireEvent.input(getByLabelText(FILTER), { target: { value: '#150' } })
    expect(shownIds(container)).toEqual(['#150'])
  })

  test('the status line counts the filtered rows', async () => {
    const { getByLabelText, getByText } = render(PokedexTab)
    await fireEvent.input(getByLabelText(FILTER), { target: { value: 'pika' } })
    expect(getByText(/caught · showing 1 of 151$/)).toBeTruthy()
  })

  test('selections survive changing the filter and are all marked', async () => {
    const { getByLabelText, getByRole } = render(PokedexTab)
    const filter = getByLabelText(FILTER)
    await fireEvent.input(filter, { target: { value: 'bulbasaur' } })
    await fireEvent.click(getByLabelText('Select Bulbasaur'))
    await fireEvent.input(filter, { target: { value: 'mew' } })
    await fireEvent.click(getByLabelText('Select Mewtwo'))
    await fireEvent.click(getByRole('button', { name: MARK_SELECTED }))
    const caught = caughtIdSet(store.data!)
    expect(caught.has(1)).toBe(true)
    expect(caught.has(150)).toBe(true)
  })
})

describe('PokedexTab sorting', () => {
  test('rows start in id order', () => {
    const { container } = render(PokedexTab)
    expect(shownIds(container).slice(0, 3)).toEqual(['#1', '#2', '#3'])
  })

  test('clicking the ID header reverses the order', async () => {
    const { getByRole, container } = render(PokedexTab)
    await fireEvent.click(getByRole('button', { name: /^ID/ }))
    expect(shownIds(container)[0]).toBe('#151')
  })

  test('clicking Name sorts alphabetically, again reverses', async () => {
    const { getByRole, container } = render(PokedexTab)
    const name = getByRole('button', { name: /^Name/ })
    await fireEvent.click(name)
    const firstAsc = container.querySelector('tbody tr td:nth-child(3)')?.textContent
    expect(firstAsc).toBe('Abra')
    await fireEvent.click(name)
    const firstDesc = container.querySelector('tbody tr td:nth-child(3)')?.textContent
    expect(firstDesc).toBe('Zubat')
  })

  test('the active sort header reports its direction', async () => {
    const { getByRole } = render(PokedexTab)
    const idHeader = getByRole('columnheader', { name: /^ID/ })
    expect(idHeader.getAttribute('aria-sort')).toBe('ascending')
    await fireEvent.click(getByRole('button', { name: /^ID/ }))
    expect(idHeader.getAttribute('aria-sort')).toBe('descending')
  })
})
