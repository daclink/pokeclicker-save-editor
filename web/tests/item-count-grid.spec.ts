// @vitest-environment happy-dom
/**
 * ItemCountGrid commit-on-blur behaviour: valid edits are forwarded once,
 * invalid text snaps back without writing, unchanged values are a no-op.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'

import ItemCountGrid from '../src/components/ItemCountGrid.svelte'

afterEach(() => cleanup())

function setup(counts: Record<string, number> = { Fire_egg: 3 }) {
  const onCommit = vi.fn()
  const utils = render(ItemCountGrid, {
    props: { keys: ['Fire_egg', 'Dragon_egg'], counts, onCommit },
  })
  const input = (label: string) => utils.getByLabelText(`${label} count`) as HTMLInputElement
  return { onCommit, input }
}

async function typeAndBlur(el: HTMLInputElement, value: string) {
  await fireEvent.input(el, { target: { value } })
  await fireEvent.blur(el)
}

describe('ItemCountGrid', () => {
  test('shows display names and current counts (missing → 0)', () => {
    const { input } = setup()
    expect(input('Fire egg').value).toBe('3')
    expect(input('Dragon egg').value).toBe('0')
  })

  test('a changed valid count commits once with the parsed number', async () => {
    const { input, onCommit } = setup()
    await typeAndBlur(input('Dragon egg'), '1,250')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('Dragon_egg', 1250)
  })

  test('empty text means 0 (which the helpers turn into a delete)', async () => {
    const { input, onCommit } = setup()
    await typeAndBlur(input('Fire egg'), '')
    expect(onCommit).toHaveBeenCalledWith('Fire_egg', 0)
  })

  test.each(['-5', '2.5', 'abc', '1e3'])('invalid %j snaps back without committing', async (bad) => {
    const { input, onCommit } = setup()
    await typeAndBlur(input('Fire egg'), bad)
    expect(onCommit).not.toHaveBeenCalled()
    expect(input('Fire egg').value).toBe('3')
  })

  test('re-entering the current value is a no-op', async () => {
    const { input, onCommit } = setup()
    await typeAndBlur(input('Fire egg'), '3')
    expect(onCommit).not.toHaveBeenCalled()
  })
})
