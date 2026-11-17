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
import { EFFORT_POINTS_PER_EV, POKERUS, POKERUS_RESISTANT_EVS } from '../src/lib/caught'

/** <td> index of the EVs column (0 is the selection checkbox). */
const COL_EVS = 5

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
  store.isDirty = false
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

  // --- EVs ---------------------------------------------------------------

  const RESISTANT_POINTS = POKERUS_RESISTANT_EVS * EFFORT_POINTS_PER_EV

  test('bulk Resistant raises low EVs to 50 but keeps higher EVs', async () => {
    rawEntry(25)['9'] = 504479
    const { getByRole, getByLabelText } = render(CaughtTab)
    await fireEvent.click(getByLabelText('Select all visible'))
    await fireEvent.change(getByLabelText('Bulk pokérus level'), {
      target: { value: String(POKERUS.Resistant) },
    })
    await fireEvent.click(getByRole('button', { name: 'Apply pokérus' }))

    expect(rawEntry(4)['8']).toBe(POKERUS.Resistant)
    expect(rawEntry(4)['9']).toBe(RESISTANT_POINTS)
    expect(rawEntry(25)['8']).toBe(POKERUS.Resistant)
    expect(rawEntry(25)['9']).toBe(504479)
  })

  test('Set EVs is disabled until something is selected', () => {
    const { getByRole } = render(CaughtTab)
    expect((getByRole('button', { name: 'Set EVs' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('the bulk EVs box defaults to the Resistant threshold', () => {
    const { getByLabelText } = render(CaughtTab)
    expect((getByLabelText('Bulk EVs') as HTMLInputElement).value).toBe(String(POKERUS_RESISTANT_EVS))
  })

  test('bulk Set EVs writes effort points to every selected row', async () => {
    const { getByRole, getByLabelText } = render(CaughtTab)
    await fireEvent.click(getByLabelText('Select all visible'))
    await fireEvent.input(getByLabelText('Bulk EVs'), { target: { value: '120' } })
    await fireEvent.click(getByRole('button', { name: 'Set EVs' }))
    expect(rawEntry(4)['9']).toBe(120 * EFFORT_POINTS_PER_EV)
    expect(rawEntry(25)['9']).toBe(120 * EFFORT_POINTS_PER_EV)
    expect(store.isDirty).toBe(true)
  })

  test.each(['abc', '-5', '1.5', '', '   '])('bulk Set EVs rejects "%s": nothing written, not dirty', async (bad) => {
    const { getByRole, getByLabelText } = render(CaughtTab)
    await fireEvent.click(getByLabelText('Select all visible'))
    await fireEvent.input(getByLabelText('Bulk EVs'), { target: { value: bad } })
    await fireEvent.click(getByRole('button', { name: 'Set EVs' }))
    expect('9' in rawEntry(4)).toBe(false)
    expect('9' in rawEntry(25)).toBe(false)
    expect(store.isDirty).toBe(false)
    expect(store.status).toBe('invalid value rejected')
  })

  test('the EVs column shows whole EVs and sorts numerically', async () => {
    rawEntry(4)['9'] = 9000 // 9 EVs
    rawEntry(25)['9'] = 52836 // 52 EVs — would sort before "9" as text
    const { getByRole } = render(CaughtTab)
    const evCells = () =>
      Array.from(document.querySelectorAll('table tbody tr')).map(
        (tr) => tr.querySelectorAll('td')[COL_EVS].textContent?.trim(),
      )
    await fireEvent.click(getByRole('button', { name: /^EVs/ }))
    expect(evCells()).toEqual(['9', '52'])
    await fireEvent.click(getByRole('button', { name: /^EVs/ }))
    expect(evCells()).toEqual(['52', '9'])
  })
})
