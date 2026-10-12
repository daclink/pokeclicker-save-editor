// @vitest-environment happy-dom
/**
 * Eggs tab edit dialog: the Pokémon ID field must round-trip form ids such
 * as 306.01 untouched when the user merely tabs through it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { tick } from 'svelte'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'

import { decodeBytes } from '../src/lib/save'
import { store } from '../src/lib/store.svelte'
import EggsTab from '../src/tabs/EggsTab.svelte'
import { DEFAULT_NEW_EGG, SHINY_CHANCE_BREEDING } from '../src/lib/breeding'

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')

/** A real form id: Pokémon #306 with form suffix .01 (see the eval report). */
const FORM_ID = 306.01

beforeEach(() => {
  store.data = decodeBytes(readFileSync(FIXTURE, 'utf8').trim())
  const breeding = (store.data!.save as any).breeding
  breeding.eggList = [
    { type: 0, pokemon: FORM_ID, steps: 10, totalSteps: 100, shinyChance: SHINY_CHANCE_BREEDING, notified: false },
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

const breeding = () => (store.data!.save as any).breeding

/** A non-empty egg occupying a slot. */
const fullEgg = (pokemon: number) => ({ ...DEFAULT_NEW_EGG, pokemon })

describe('EggsTab slots', () => {
  test('rows show their slot number out of the 4-slot cap', () => {
    render(EggsTab)
    expect(screen.getByText('1 of 4')).toBeTruthy()
  })

  test('quick-add with all 4 slots full is refused with a status message', async () => {
    breeding().eggList = [fullEgg(1), fullEgg(4), fullEgg(7), fullEgg(25)]
    breeding().eggSlots = 4
    const before = JSON.stringify(breeding())
    render(EggsTab)
    await fireEvent.click(screen.getByRole('button', { name: '+ Dratini egg' }))
    expect(store.status).toMatch(/All 4 egg slots are full/)
    expect(JSON.stringify(breeding())).toBe(before)
  })

  test('add egg with all 4 slots full is refused with a status message', async () => {
    breeding().eggList = [fullEgg(1), fullEgg(4), fullEgg(7), fullEgg(25)]
    breeding().eggSlots = 4
    const before = JSON.stringify(breeding())
    render(EggsTab)
    await fireEvent.click(screen.getByRole('button', { name: /Add egg/ }))
    expect(store.status).toMatch(/All 4 egg slots are full/)
    expect(JSON.stringify(breeding())).toBe(before)
  })

  test('one Empty button per row (no separate Remove); emptying keeps other slots in place', async () => {
    breeding().eggList = [fullEgg(1), fullEgg(4), fullEgg(7)]
    render(EggsTab)
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Empty' })[0])
    expect(breeding().eggList.map((e: { pokemon: number }) => e.pokemon)).toEqual([0, 4, 7])
  })
})

describe('EggsTab edit dialog: validation and type', () => {
  test('an unknown Pokémon id is not saved and shows an error', async () => {
    render(EggsTab)
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const field = screen.getByLabelText('Pokémon ID') as HTMLInputElement
    await fireEvent.input(field, { target: { value: '99999' } })
    await fireEvent.blur(field)
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(eggPokemon()).toBe(FORM_ID)
    expect(screen.getByRole('alert').textContent).toMatch(/99999/)
  })

  test('the Type select offers only the game\'s three egg types', async () => {
    render(EggsTab)
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const select = screen.getByLabelText('Type') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['-1', '0', '1'])
  })

  test('a legacy type value is kept as an extra Unknown option', async () => {
    breeding().eggList[0].type = 3
    render(EggsTab)
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const select = screen.getByLabelText('Type') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['-1', '0', '1', '3'])
    expect(select.value).toBe('3')
    expect(select.selectedOptions[0].textContent).toMatch(/Unknown \(#3\)/)
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(breeding().eggList[0].type).toBe(3)
  })
})

describe('EggsTab edit dialog: Shiny chance', () => {
  /** Real saves carry fractional chances (the game divides by bonuses). */
  const FRACTIONAL_CHANCE = 458.47

  test('a fractional shiny chance is shown and kept, and a typed decimal is saved', async () => {
    breeding().eggList[0].shinyChance = FRACTIONAL_CHANCE
    render(EggsTab)
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const field = screen.getByLabelText(/^Shiny chance/) as HTMLInputElement
    expect(field.value).toBe(String(FRACTIONAL_CHANCE))
    await fireEvent.input(field, { target: { value: '300.5' } })
    await fireEvent.blur(field)
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(breeding().eggList[0].shinyChance).toBe(300.5)
  })
})

describe('EggsTab slots field', () => {
  const slotsField = () => screen.getByLabelText(/^Egg slots/) as HTMLInputElement
  const savedSlots = () => (store.data!.save as any).breeding.eggSlots

  test('a refused slot count snaps the field back to the saved value', async () => {
    render(EggsTab)
    const before = slotsField().value
    await fireEvent.input(slotsField(), { target: { value: '5' } })
    await fireEvent.blur(slotsField())
    await tick()
    expect(slotsField().value).toBe(before)
    expect(String(savedSlots())).toBe(before)
  })

  test('an accepted slot count stays in the field', async () => {
    render(EggsTab)
    await fireEvent.input(slotsField(), { target: { value: '2' } })
    await fireEvent.blur(slotsField())
    await tick()
    expect(savedSlots()).toBe(2)
    expect(slotsField().value).toBe('2')
  })
})
