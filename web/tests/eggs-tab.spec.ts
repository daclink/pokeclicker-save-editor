// @vitest-environment happy-dom
/**
 * Eggs tab edit dialog: the Pokémon ID field must round-trip form ids such
 * as 306.01 untouched when the user merely tabs through it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'

import { decodeBytes } from '../src/lib/save'
import { store } from '../src/lib/store.svelte'
import EggsTab from '../src/tabs/EggsTab.svelte'

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')

/** A real form id: Pokémon #306 with form suffix .01 (see the eval report). */
const FORM_ID = 306.01

beforeEach(() => {
  store.data = decodeBytes(readFileSync(FIXTURE, 'utf8').trim())
  const breeding = (store.data!.save as any).breeding
  breeding.eggList = [
    { type: 0, pokemon: FORM_ID, steps: 10, totalSteps: 100, shinyChance: 1024, notified: false },
  ]
  // happy-dom may lack HTMLDialogElement.showModal/close.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {}
    HTMLDialogElement.prototype.close = function () {}
  }
})

afterEach(() => {
  store.data = null
  cleanup()
})

const eggPokemon = () => (store.data!.save as any).breeding.eggList[0].pokemon

describe('EggsTab edit dialog: Pokémon ID', () => {
  test('tabbing through the field keeps a form id and OK saves it unchanged', async () => {
    render(EggsTab)
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const field = screen.getByLabelText('Pokémon ID') as HTMLInputElement
    expect(field.value).toBe(String(FORM_ID))
    await fireEvent.focus(field)
    await fireEvent.blur(field)
    expect(field.value).toBe(String(FORM_ID))
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(eggPokemon()).toBe(FORM_ID)
  })

  test('typing another form id is saved with its decimals', async () => {
    render(EggsTab)
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const field = screen.getByLabelText('Pokémon ID') as HTMLInputElement
    await fireEvent.input(field, { target: { value: '129.02' } })
    await fireEvent.blur(field)
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(eggPokemon()).toBe(129.02)
  })
})
