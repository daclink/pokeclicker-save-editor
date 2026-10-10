// @vitest-environment happy-dom
/**
 * Pokédex tab "Show forms": alternate forms (fractional ids such as Pikachu
 * 25.01) get their own rows and can be marked caught. Fixture has exactly
 * Charmander (#4) and Pikachu (#25) caught; Kanto is the default region.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'

import { decodeBytes } from '../src/lib/save'
import { nameFor } from '../src/lib/data'
import { caughtIdSet } from '../src/lib/pokedex'
import { store } from '../src/lib/store.svelte'
import PokedexTab from '../src/tabs/PokedexTab.svelte'

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')
const SHOW_FORMS = /Show forms/
const PIKACHU_FORM = 25.01
const FORM_NAME = nameFor(PIKACHU_FORM)

beforeEach(() => {
  store.data = decodeBytes(readFileSync(FIXTURE, 'utf8').trim())
})

afterEach(() => {
  store.data = null
  cleanup()
})

describe('PokedexTab Show forms', () => {
  test('forms are hidden by default and listed once toggled', async () => {
    const { getByLabelText, queryByText, getByText } = render(PokedexTab)
    expect(queryByText(FORM_NAME)).toBeNull()
    await fireEvent.click(getByLabelText(SHOW_FORMS))
    expect(getByText(FORM_NAME)).toBeTruthy()
    expect(getByText(`#${PIKACHU_FORM}`)).toBeTruthy()
  })

  test('a selected form can be marked caught', async () => {
    const { getByLabelText, getByRole } = render(PokedexTab)
    await fireEvent.click(getByLabelText(SHOW_FORMS))
    await fireEvent.click(getByLabelText(`Select ${FORM_NAME}`))
    await fireEvent.click(getByRole('button', { name: /Mark selected caught/ }))
    expect(caughtIdSet(store.data!).has(PIKACHU_FORM)).toBe(true)
  })

  test('a selected form hidden by unticking Show forms is not marked', async () => {
    const { getByLabelText, getByRole } = render(PokedexTab)
    await fireEvent.click(getByLabelText(SHOW_FORMS))
    await fireEvent.click(getByLabelText(`Select ${FORM_NAME}`))
    await fireEvent.click(getByLabelText(SHOW_FORMS))
    await fireEvent.click(getByRole('button', { name: /Mark selected caught/ }))
    expect(caughtIdSet(store.data!).has(PIKACHU_FORM)).toBe(false)
  })
})
