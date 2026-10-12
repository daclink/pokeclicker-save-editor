// @vitest-environment happy-dom
/**
 * Pokédex tab "Show forms": alternate forms (fractional ids such as Pikachu
 * 25.01) get their own rows and can be marked caught. Fixture has exactly
 * Charmander (#4) and Pikachu (#25) caught; Kanto is the default region.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'

import { decodeBytes } from '../src/lib/save'
import { DATA_GAME_VERSION, REGION_RANGES, nameFor } from '../src/lib/data'
import { caughtIdSet } from '../src/lib/pokedex'
import { store } from '../src/lib/store.svelte'
import PokedexTab from '../src/tabs/PokedexTab.svelte'

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')
const SHOW_FORMS = /Show forms/
const PIKACHU_FORM = 25.01
const FORM_NAME = nameFor(PIKACHU_FORM)
const OLDER_VERSION = '0.10.25'
const KANTO = REGION_RANGES[0]
/** Charmander + Pikachu. */
const FIXTURE_KANTO_CAUGHT = 2
const FORMS_BLOCKED = /older than this editor's data/

/** Load the fixture with `save.update.version` set to `version`. */
function loadAs(version: string): void {
  store.data = decodeBytes(readFileSync(FIXTURE, 'utf8').trim())
  ;(store.data.save as Record<string, any>).update = { version }
}

// The fixture is a v0.10.25 export; forms are only markable on a save at
// least as new as the editor's data, so the default here is the data version.
beforeEach(() => loadAs(DATA_GAME_VERSION))

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

  test('no forms warning on a save as new as the data', async () => {
    const { getByLabelText, queryByText } = render(PokedexTab)
    await fireEvent.click(getByLabelText(SHOW_FORMS))
    expect(queryByText(FORMS_BLOCKED)).toBeNull()
  })
})

describe('PokedexTab forms on a save older than the data', () => {
  beforeEach(() => loadAs(OLDER_VERSION))

  test('Show forms explains that forms will not be marked', async () => {
    const { getByLabelText, queryByText, getByText } = render(PokedexTab)
    expect(queryByText(FORMS_BLOCKED)).toBeNull() // only relevant once forms are listed
    await fireEvent.click(getByLabelText(SHOW_FORMS))
    const note = getByText(FORMS_BLOCKED)
    expect(note.textContent).toContain(OLDER_VERSION)
    expect(note.textContent).toContain(DATA_GAME_VERSION)
  })

  test('a selected form is skipped (status says so); base species still marked', async () => {
    const { getByLabelText, getByRole } = render(PokedexTab)
    await fireEvent.click(getByLabelText(SHOW_FORMS))
    await fireEvent.click(getByLabelText(`Select ${FORM_NAME}`))
    await fireEvent.click(getByLabelText(`Select ${nameFor(1)}`))
    await fireEvent.click(getByRole('button', { name: /Mark selected caught/ }))
    const ids = caughtIdSet(store.data!)
    expect(ids.has(PIKACHU_FORM)).toBe(false)
    expect(ids.has(1)).toBe(true)
    expect(store.status).toMatch(/marked 1 caught/)
    expect(store.status).toMatch(/skipped 1 form/)
  })

  test('Mark all uncaught confirms and writes base species only', async () => {
    const prompts: string[] = []
    vi.stubGlobal('confirm', (msg: string) => {
      prompts.push(String(msg))
      return true
    })
    try {
      const { getByLabelText, getByRole } = render(PokedexTab)
      await fireEvent.click(getByLabelText(SHOW_FORMS))
      await fireEvent.click(getByRole('button', { name: /Mark all uncaught/ }))
      const kantoUncaught = KANTO.hi - KANTO.lo + 1 - FIXTURE_KANTO_CAUGHT
      expect(prompts).toEqual([expect.stringContaining(`Mark all ${kantoUncaught} uncaught`)])
      const ids = [...caughtIdSet(store.data!)]
      expect(ids.some((pid) => !Number.isInteger(pid))).toBe(false)
      expect(ids).toHaveLength(KANTO.hi - KANTO.lo + 1)
      expect(store.status).toMatch(/skipped \d+ forms/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
