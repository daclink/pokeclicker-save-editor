// @vitest-environment happy-dom
/**
 * Regression test: double-click a caught-pokémon row, change pokérus to
 * Contagious in the edit dialog, click OK — the table cell must update.
 *
 * Two distinct failure modes are distinguished:
 *   A. entry["8"] stays 0 → new value never reached draft/patch (select not
 *      committing); the `bind:value` + numeric-coercion fix applies.
 *   B. entry["8"] === 2 but the table still shows "Uninfected" → render /
 *      reactivity bug in the tick++ / $derived path.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte'

import { decodeBytes } from '../src/lib/save'
import { store } from '../src/lib/store.svelte'
import CaughtTab from '../src/tabs/CaughtTab.svelte'
import { EFFORT_POINTS_PER_EV, POKERUS, POKERUS_RESISTANT_EVS } from '../src/lib/caught'

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')
const loadFixture = () => decodeBytes(readFileSync(FIXTURE, 'utf8').trim())

// Table column positions (<td> index). Column 0 is the selection checkbox.
const COL = { id: 1, pokerus: 4, evs: 5, shiny: 8 } as const

function rawEntry(id: number): Record<string, unknown> {
  const list = (store.data!.save as any).party.caughtPokemon as Array<Record<string, unknown>>
  const e = list.find((x: any) => x?.id === id)
  if (!e) throw new Error(`no entry with id ${id} in fixture`)
  return e
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  store.data = loadFixture()
})

afterEach(() => {
  store.data = null
  store.isDirty = false
  cleanup()
})

// ---------------------------------------------------------------------------
// showModal polyfill — happy-dom may not implement HTMLDialogElement.showModal.
// The dialog's {#if selectedRow} block renders into the DOM regardless of open
// state, so a no-op showModal still lets us interact with the select.
// ---------------------------------------------------------------------------

function polyfillDialog(): void {
  if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { /* no-op in happy-dom */ }
    HTMLDialogElement.prototype.close = function () { /* no-op in happy-dom */ }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CaughtTab edit dialog — pokérus update', () => {
  test('happy-dom has (or gets polyfilled) HTMLDialogElement.showModal', () => {
    polyfillDialog()
    const dlg = document.createElement('dialog') as HTMLDialogElement
    expect(() => dlg.showModal()).not.toThrow()
  })

  test('changing pokérus to Contagious updates the table cell', async () => {
    polyfillDialog()

    const { getAllByRole, getByRole } = render(CaughtTab)

    // --- 1. Locate the row for id=4 (Charmander) and double-click it --------
    //
    // The table renders rows. ID 4 is Charmander. We look for a cell
    // containing "4" in the ID column by finding the row whose first <td> is
    // exactly "4". We use getAllByRole('row') from tbody.
    const rows = getAllByRole('row')
    // Header row is index 0; data rows follow. Find the one with id=4.
    const targetRow = rows.find((row) => {
      const cells = row.querySelectorAll('td')
      return cells.length > 0 && cells[COL.id].textContent?.trim() === '4'
    })
    expect(targetRow, 'row for id=4 (Charmander) must exist').toBeTruthy()

    // Double-click to select + open edit dialog.
    await fireEvent.dblClick(targetRow!)

    // --- 2. The dialog should be in the DOM. Find the pokérus <select> ------
    //
    // The dialog markup always renders when selectedRow is truthy. After the
    // dblclick, selectedId=4 and selectedRow should be the Charmander entry.
    const pokerusSelect = await waitFor(() => {
      const select = document.querySelector('dialog select') as HTMLSelectElement | null
      if (!select) throw new Error('pokérus <select> not found in dialog')
      return select
    })

    // Verify initial value is "0" (Uninfected).
    expect(pokerusSelect.value).toBe('0')

    // --- 3. Change pokérus to Contagious (value "2") -------------------------
    await fireEvent.change(pokerusSelect, { target: { value: '2' } })

    // --- 4. Click OK ---------------------------------------------------------
    const okButton = getByRole('button', { name: /^ok$/i })
    await fireEvent.click(okButton)

    // --- 5. Assert the underlying save data was updated ---------------------
    //
    // This discriminates between the two failure modes:
    //   • entry["8"] === 0 → new value never reached patch (select bug)
    //   • entry["8"] === 2 → save updated correctly; if table is wrong it's render
    const entry = rawEntry(4)
    expect(entry['8'], 'save entry key "8" should be 2 (Contagious) after OK').toBe(2)

    // --- 6. Assert the table cell updated to "Contagious" -------------------
    //
    // Use waitFor to allow Svelte reactivity to flush after tick++.
    await waitFor(() => {
      // Re-query the row each time — Svelte may re-render the DOM.
      const updatedRows = document.querySelectorAll('table tbody tr')
      const charmRow = Array.from(updatedRows).find((row) => {
        const cells = row.querySelectorAll('td')
        return cells.length > 0 && cells[COL.id].textContent?.trim() === '4'
      })
      expect(charmRow, 'row for id=4 must still exist after edit').toBeTruthy()

      const cells = charmRow!.querySelectorAll('td')
      expect(
        cells[COL.pokerus].textContent?.trim(),
        'pokérus table cell for id=4 should show "Contagious"',
      ).toBe('Contagious')
    })
  })

  test('Shiny on for a clicked row still works (baseline for the tick++ path)', async () => {
    polyfillDialog()

    const { getAllByRole, getByRole } = render(CaughtTab)

    const rows = getAllByRole('row')
    const targetRow = rows.find((row) => {
      const cells = row.querySelectorAll('td')
      return cells.length > 0 && cells[COL.id].textContent?.trim() === '25'
    })
    expect(targetRow, 'row for id=25 (Pikachu) must exist').toBeTruthy()

    // Single-click the row to select it.
    await fireEvent.click(targetRow!)

    // Click "Shiny on" (bulk action; applies to the one selected row).
    const markShinyBtn = getByRole('button', { name: 'Shiny on' })
    await fireEvent.click(markShinyBtn)

    // Verify underlying data and table.
    expect(rawEntry(25)['5'], 'shiny key "5" should be true').toBe(true)

    await waitFor(() => {
      const updatedRows = document.querySelectorAll('table tbody tr')
      const pikaRow = Array.from(updatedRows).find((row) => {
        const cells = row.querySelectorAll('td')
        return cells.length > 0 && cells[COL.id].textContent?.trim() === '25'
      })
      expect(pikaRow, 'row for id=25 must exist after mark-shiny').toBeTruthy()
      const cells = pikaRow!.querySelectorAll('td')
      expect(cells[COL.shiny].textContent?.trim(), 'shiny cell for Pikachu should show "yes"').toBe('yes')
    })
  })
})

// ---------------------------------------------------------------------------
// EVs in the edit dialog
// ---------------------------------------------------------------------------

const RESISTANT_POINTS = POKERUS_RESISTANT_EVS * EFFORT_POINTS_PER_EV

function rowFor(id: number): HTMLTableRowElement {
  const row = Array.from(document.querySelectorAll('table tbody tr')).find(
    (tr) => tr.querySelectorAll('td')[COL.id]?.textContent?.trim() === String(id),
  )
  if (!row) throw new Error(`no table row for id ${id}`)
  return row as HTMLTableRowElement
}

async function openDialogFor(id: number): Promise<HTMLSelectElement> {
  await fireEvent.dblClick(rowFor(id))
  return waitFor(() => {
    const select = document.querySelector('dialog select') as HTMLSelectElement | null
    if (!select) throw new Error('pokérus <select> not found in dialog')
    return select
  })
}

async function typeInto(label: string, value: string): Promise<void> {
  const input = Array.from(document.querySelectorAll('dialog label')).find(
    (l) => l.querySelector('.label')?.textContent?.trim() === label,
  )?.querySelector('input') as HTMLInputElement | null
  if (!input) throw new Error(`dialog field "${label}" not found`)
  await fireEvent.input(input, { target: { value } })
  await fireEvent.blur(input)
}

describe('CaughtTab edit dialog — EVs', () => {
  test('choosing Resistant gives a 0-EV pokémon 50 EVs and the cell updates', async () => {
    polyfillDialog()
    const { getByRole } = render(CaughtTab)
    const select = await openDialogFor(4)
    await fireEvent.change(select, { target: { value: String(POKERUS.Resistant) } })
    await fireEvent.click(getByRole('button', { name: /^ok$/i }))

    expect(rawEntry(4)['8']).toBe(POKERUS.Resistant)
    expect(rawEntry(4)['9']).toBe(RESISTANT_POINTS)
    await waitFor(() =>
      expect(rowFor(4).querySelectorAll('td')[COL.evs].textContent?.trim()).toBe(
        String(POKERUS_RESISTANT_EVS),
      ),
    )
  })

  test('choosing Resistant never lowers EVs that are already higher', async () => {
    polyfillDialog()
    rawEntry(4)['9'] = 504479
    const { getByRole } = render(CaughtTab)
    const select = await openDialogFor(4)
    await fireEvent.change(select, { target: { value: String(POKERUS.Resistant) } })
    await fireEvent.click(getByRole('button', { name: /^ok$/i }))
    expect(rawEntry(4)['9']).toBe(504479)
  })

  test('editing the EVs field writes effort points', async () => {
    polyfillDialog()
    const { getByRole } = render(CaughtTab)
    await openDialogFor(4)
    await typeInto('EVs', '75')
    await fireEvent.click(getByRole('button', { name: /^ok$/i }))
    expect(rawEntry(4)['9']).toBe(75 * EFFORT_POINTS_PER_EV)
  })

  test('lowering EVs on an already-Resistant pokémon sticks (no re-raise, no demotion)', async () => {
    polyfillDialog()
    rawEntry(4)['8'] = POKERUS.Resistant
    rawEntry(4)['9'] = 52836
    const { getByRole } = render(CaughtTab)
    await openDialogFor(4)
    await typeInto('EVs', '30')
    await fireEvent.click(getByRole('button', { name: /^ok$/i }))
    expect(rawEntry(4)['9']).toBe(30 * EFFORT_POINTS_PER_EV)
    expect(rawEntry(4)['8']).toBe(POKERUS.Resistant)
  })

  test('OK with nothing changed writes nothing and leaves the save clean', async () => {
    polyfillDialog()
    rawEntry(4)['8'] = POKERUS.Resistant // editor-made Resistant with 0 EVs
    const before = JSON.stringify(rawEntry(4))
    const { getByRole } = render(CaughtTab)
    await openDialogFor(4)
    await fireEvent.click(getByRole('button', { name: /^ok$/i }))
    expect(JSON.stringify(rawEntry(4))).toBe(before)
    expect(store.isDirty).toBe(false)
  })

  test('changing only exp leaves exact effort points alone', async () => {
    polyfillDialog()
    rawEntry(4)['9'] = 52836
    const { getByRole } = render(CaughtTab)
    await openDialogFor(4)
    await typeInto('exp', '999')
    await fireEvent.click(getByRole('button', { name: /^ok$/i }))
    expect(rawEntry(4)['3']).toBe(999)
    expect(rawEntry(4)['9']).toBe(52836)
  })

  test('a fractional EVs entry is refused by the field (nothing written)', async () => {
    polyfillDialog()
    const { getByRole } = render(CaughtTab)
    await openDialogFor(4)
    await typeInto('EVs', '1.5')
    await fireEvent.click(getByRole('button', { name: /^ok$/i }))
    expect('9' in rawEntry(4)).toBe(false)
  })
})
