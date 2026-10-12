// @vitest-environment happy-dom
/**
 * Keyboard access for the Caught table: rows are focusable, Space toggles
 * selection, Enter opens the edit dialog (the keyboard twin of double-click).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte'

import { decodeBytes } from '../src/lib/save'
import { store } from '../src/lib/store.svelte'
import CaughtTab from '../src/tabs/CaughtTab.svelte'

const FIXTURE = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'v0.10.25', 'minimal.txt')
const ID_COL = 1
const KEY_ENTER = 'Enter'
const KEY_SPACE = ' '

beforeEach(() => {
  store.data = decodeBytes(readFileSync(FIXTURE, 'utf8').trim())
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { /* no-op in happy-dom */ }
    HTMLDialogElement.prototype.close = function () { /* no-op in happy-dom */ }
  }
})
afterEach(() => {
  store.data = null
  cleanup()
})

function dataRows(): HTMLTableRowElement[] {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>('table tbody tr'))
}
function rowFor(id: string): HTMLTableRowElement {
  const row = dataRows().find((r) => r.querySelectorAll('td')[ID_COL]?.textContent?.trim() === id)
  if (!row) throw new Error(`no row for id ${id}`)
  return row
}
const checkboxOf = (row: HTMLElement) => row.querySelector('input[type="checkbox"]') as HTMLInputElement

describe('CaughtTab keyboard access', () => {
  test('every data row is focusable', () => {
    render(CaughtTab)
    const rows = dataRows()
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.getAttribute('tabindex')).toBe('0')
  })

  test('Space toggles selection on and off', async () => {
    render(CaughtTab)
    const row = rowFor('4')
    expect(checkboxOf(row).checked).toBe(false)
    await fireEvent.keyDown(row, { key: KEY_SPACE })
    await waitFor(() => expect(checkboxOf(rowFor('4')).checked).toBe(true))
    await fireEvent.keyDown(rowFor('4'), { key: KEY_SPACE })
    await waitFor(() => expect(checkboxOf(rowFor('4')).checked).toBe(false))
  })

  test('Enter opens the edit dialog without changing selection', async () => {
    render(CaughtTab)
    expect(document.querySelector('dialog select')).toBeNull()
    await fireEvent.keyDown(rowFor('4'), { key: KEY_ENTER })
    await waitFor(() => expect(document.querySelector('dialog select')).not.toBeNull())
    expect(checkboxOf(rowFor('4')).checked).toBe(false)
  })

  test('other keys do nothing', async () => {
    render(CaughtTab)
    await fireEvent.keyDown(rowFor('4'), { key: 'a' })
    expect(checkboxOf(rowFor('4')).checked).toBe(false)
    expect(document.querySelector('dialog select')).toBeNull()
  })

  test('keys pressed on the row checkbox are not hijacked by the row', async () => {
    render(CaughtTab)
    await fireEvent.keyDown(checkboxOf(rowFor('4')), { key: KEY_ENTER })
    expect(document.querySelector('dialog select')).toBeNull()
  })
})
