// @vitest-environment happy-dom
/**
 * NumberField commit semantics: strict parsing, no commit for rejected or
 * unchanged input, Escape reverts, Enter commits.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { tick } from 'svelte'
import { cleanup, fireEvent, render } from '@testing-library/svelte'

import NumberField from '../src/components/NumberField.svelte'

afterEach(() => cleanup())

function setup(value: number, integer = true) {
  const onCommit = vi.fn()
  const utils = render(NumberField, { props: { label: 'Amount', value, onCommit, integer } })
  const input = utils.getByLabelText('Amount') as HTMLInputElement
  return { onCommit, input }
}

async function typeAndBlur(el: HTMLInputElement, value: string) {
  await fireEvent.input(el, { target: { value } })
  await fireEvent.blur(el)
}

describe('NumberField (integer)', () => {
  test('1e6 commits 1000000', async () => {
    const { input, onCommit } = setup(5)
    await typeAndBlur(input, '1e6')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(1_000_000)
  })

  test('commas still work', async () => {
    const { input, onCommit } = setup(5)
    await typeAndBlur(input, '1,250')
    expect(onCommit).toHaveBeenCalledWith(1250)
  })

  test.each(['5k', '12abc', '1.5', '-3'])('%s is rejected: no commit, text reverts', async (bad) => {
    const { input, onCommit } = setup(5)
    await typeAndBlur(input, bad)
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('5')
  })

  test('unchanged blur does not commit', async () => {
    const { input, onCommit } = setup(5)
    await fireEvent.focus(input)
    await fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
  })

  test('05 when value=5 does not commit and text resyncs to 5', async () => {
    const { input, onCommit } = setup(5)
    await typeAndBlur(input, '05')
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('5')
  })

  test('blank commits 0 when value is non-zero, but not when already 0', async () => {
    const a = setup(5)
    await typeAndBlur(a.input, '')
    expect(a.onCommit).toHaveBeenCalledWith(0)
    cleanup()
    const b = setup(0)
    await typeAndBlur(b.input, '  ')
    expect(b.onCommit).not.toHaveBeenCalled()
  })

  test('Escape reverts without committing', async () => {
    const { input, onCommit } = setup(5)
    await fireEvent.input(input, { target: { value: '99' } })
    await fireEvent.keyDown(input, { key: 'Escape' })
    await fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('5')
  })

  test('Enter commits', async () => {
    const { input, onCommit } = setup(5)
    input.focus()
    await fireEvent.input(input, { target: { value: '77' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(77)
  })
})

describe('NumberField (decimal)', () => {
  test('unchanged blur keeps 306.01 and does not commit', async () => {
    const { input, onCommit } = setup(306.01, false)
    expect(input.value).toBe('306.01')
    await fireEvent.focus(input)
    await fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('306.01')
  })

  test('typing 129.02 commits 129.02', async () => {
    const { input, onCommit } = setup(306.01, false)
    await typeAndBlur(input, '129.02')
    expect(onCommit).toHaveBeenCalledWith(129.02)
  })

  test('garbage is still rejected', async () => {
    const { input, onCommit } = setup(1.5, false)
    await typeAndBlur(input, '1.5x')
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('1.5')
  })
})

/**
 * The parent may refuse a parsed value (its lib helper throws and it shows
 * an error, e.g. 5 egg slots or a 0.5 multiplier): `value` then stays put,
 * and the field must snap back to it rather than keep the refused text.
 */
describe('NumberField after the parent handles a commit', () => {
  test('refused (value unchanged) → text snaps back to the current value', async () => {
    const { input, onCommit } = setup(4)
    await typeAndBlur(input, '5')
    expect(onCommit).toHaveBeenCalledWith(5)
    await tick()
    expect(input.value).toBe('4')
  })

  test('parent handler throws → text still snaps back and the error is logged', async () => {
    const boom = new RangeError('refused by lib')
    const onCommit = vi.fn(() => {
      throw boom
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const utils = render(NumberField, { props: { label: 'Amount', value: 4, onCommit } })
    const input = utils.getByLabelText('Amount') as HTMLInputElement
    await typeAndBlur(input, '5')
    await tick()
    expect(input.value).toBe('4')
    expect(logged).toHaveBeenCalledWith(boom)
    logged.mockRestore()
  })

  test('refused decimal → text snaps back too', async () => {
    const { input } = setup(1.5, false)
    await typeAndBlur(input, '0.5')
    await tick()
    expect(input.value).toBe('1.5')
  })

  test('accepted (parent updates value) → text shows the new value', async () => {
    const onCommit = vi.fn()
    const utils = render(NumberField, { props: { label: 'Amount', value: 4, onCommit } })
    onCommit.mockImplementation((n: number) => {
      void utils.rerender({ value: n })
    })
    const input = utils.getByLabelText('Amount') as HTMLInputElement
    await typeAndBlur(input, '1e3')
    await tick()
    expect(input.value).toBe('1000')
  })
})
