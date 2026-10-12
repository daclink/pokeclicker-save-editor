// @vitest-environment happy-dom
/**
 * Currencies tab fields after a commit: an accepted value stays shown, a
 * refused one (multiplier below 1) snaps back to what the save holds.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'

import { decodeBytes } from '../src/lib/save'
import { readCurrencies } from '../src/lib/currencies'
import { store } from '../src/lib/store.svelte'
import CurrenciesTab from '../src/tabs/CurrenciesTab.svelte'

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')

beforeEach(() => {
  store.data = decodeBytes(readFileSync(FIXTURE, 'utf8').trim())
})

afterEach(() => {
  store.data = null
  store.isDirty = false
  cleanup()
})

async function typeAndBlur(el: HTMLInputElement, value: string) {
  await fireEvent.input(el, { target: { value } })
  await fireEvent.blur(el)
  await tick()
}

describe('CurrenciesTab fields', () => {
  test('an accepted currency edit is written and stays in the field', async () => {
    render(CurrenciesTab)
    const field = screen.getByLabelText('PokéDollars') as HTMLInputElement
    await typeAndBlur(field, '123456')
    expect(readCurrencies(store.data!).money).toBe(123456)
    expect(field.value).toBe('123456')
  })

  test('a refused multiplier (below 1) snaps back to the saved value', async () => {
    const { container } = render(CurrenciesTab)
    const inputs = [...container.querySelectorAll('input')] as HTMLInputElement[]
    // The first input after the 7 wallet rows is the first multiplier.
    const field = inputs[7]
    expect(field).toBeTruthy()
    const before = field.value
    await typeAndBlur(field, '0.5')
    expect(field.value).toBe(before)
  })
})
