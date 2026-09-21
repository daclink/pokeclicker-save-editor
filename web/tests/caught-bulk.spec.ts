// @vitest-environment happy-dom
/**
 * Caught tab bulk editing: checkbox multi-select (header = all *visible*
 * rows, so filters scope the bulk action), bulk shiny on/off and bulk
 * pokérus. Fixture has exactly Charmander (#4, Fire) and Pikachu (#25,
 * Electric) caught.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'

import { decodeBytes } from '../src/lib/save'
import { store } from '../src/lib/store.svelte'
import CaughtTab from '../src/tabs/CaughtTab.svelte'

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')

function rawEntry(id: number): Record<string, unknown> {
  const list = (store.data!.save as any).party.caughtPokemon as Array<Record<string, unknown>>
  const e = list.find((x: any) => x?.id === id)
  if (!e) throw new Error(`no entry with id ${id}`)
  return e
}

beforeEach(() => {
  store.data = decodeBytes(readFileSync(FIXTURE, 'utf8').trim())
})

afterEach(() => {
  store.data = null
  cleanup()
})

describe('CaughtTab bulk edit', () => {
  test('bulk buttons are disabled until something is selected', () => {
    const { getByRole } = render(CaughtTab)
    expect((getByRole('button', { name: 'Shiny on' }) as HTMLButtonElement).disabled).toBe(true)
    expect((getByRole('button', { name: 'Apply pokérus' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('select all visible → pokérus Contagious applies to every row', async () => {
    const { getByRole, getByLabelText, getByText } = render(CaughtTab)
    await fireEvent.click(getByLabelText('Select all visible'))
    expect(getByText('2 selected')).toBeTruthy()

    await fireEvent.change(getByLabelText('Bulk pokérus level'), { target: { value: '2' } })
    await fireEvent.click(getByRole('button', { name: 'Apply pokérus' }))

    expect(rawEntry(4)['8']).toBe(2)
    expect(rawEntry(25)['8']).toBe(2)
  })

  test('bulk shiny on, then off (off deletes key "5")', async () => {
    const { getByRole, getByLabelText } = render(CaughtTab)
    await fireEvent.click(getByLabelText('Select all visible'))
    await fireEvent.click(getByRole('button', { name: 'Shiny on' }))
    expect(rawEntry(4)['5']).toBe(true)
    expect(rawEntry(25)['5']).toBe(true)
    await fireEvent.click(getByRole('button', { name: 'Shiny off' }))
    expect('5' in rawEntry(4)).toBe(false)
    expect('5' in rawEntry(25)).toBe(false)
  })

  test('filters scope "select all": Fire-only selection leaves Pikachu alone', async () => {
    const { getByRole, getByLabelText } = render(CaughtTab)
    await fireEvent.change(getByLabelText('Type 1'), { target: { value: 'Fire' } })
    await fireEvent.click(getByLabelText('Select all visible'))
    await fireEvent.click(getByRole('button', { name: 'Shiny on' }))
    expect(rawEntry(4)['5']).toBe(true)
    expect('5' in rawEntry(25)).toBe(false)
  })

  test('individual row checkboxes select just that row', async () => {
    const { getByRole, getByLabelText } = render(CaughtTab)
    await fireEvent.click(getByLabelText('Select Pikachu'))
    await fireEvent.click(getByRole('button', { name: 'Shiny on' }))
    expect(rawEntry(25)['5']).toBe(true)
    expect('5' in rawEntry(4)).toBe(false)
  })
})
