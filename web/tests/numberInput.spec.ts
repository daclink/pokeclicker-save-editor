import { describe, expect, test } from 'vitest'
import { parseNumberInput } from '../src/lib/numberInput'

const INT = { integer: true }
const DEC = { integer: false }

describe('parseNumberInput: accepted literals', () => {
  const ACCEPT_BOTH: Array<[string, number]> = [
    ['42', 42],
    ['0', 0],
    ['05', 5],
    ['1e6', 1_000_000],
    ['1E6', 1_000_000],
    ['1e+6', 1_000_000],
    ['2.5E3', 2500],
    ['1.5e1', 15],
    ['1,000,000', 1_000_000],
    ['  42  ', 42],
  ]
  test.each(ACCEPT_BOTH)('%s -> %s in both modes', (text, want) => {
    expect(parseNumberInput(text, INT)).toBe(want)
    expect(parseNumberInput(text, DEC)).toBe(want)
  })

  test('blank (and whitespace/comma-only) is 0 in both modes', () => {
    for (const t of ['', '   ', ',', ' , ']) {
      expect(parseNumberInput(t, INT)).toBe(0)
      expect(parseNumberInput(t, DEC)).toBe(0)
    }
  })

  test('decimal mode keeps fractions and form ids', () => {
    expect(parseNumberInput('1.5', DEC)).toBe(1.5)
    expect(parseNumberInput('306.01', DEC)).toBe(306.01)
    expect(parseNumberInput('129.02', DEC)).toBe(129.02)
    expect(parseNumberInput('.5', DEC)).toBe(0.5)
    expect(parseNumberInput('5.', DEC)).toBe(5)
    expect(parseNumberInput('1e-2', DEC)).toBe(0.01)
  })
})

describe('parseNumberInput: integer mode', () => {
  test('rejects fractions instead of truncating', () => {
    expect(parseNumberInput('1.5', INT)).toBeNull()
    expect(parseNumberInput('306.01', INT)).toBeNull()
    expect(parseNumberInput('1e-2', INT)).toBeNull()
  })
  test('MAX_SAFE_INTEGER boundary', () => {
    expect(parseNumberInput('9007199254740991', INT)).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseNumberInput('9007199254740992', INT)).toBeNull()
    expect(parseNumberInput('1e16', INT)).toBeNull()
    expect(parseNumberInput('1e15', INT)).toBe(1e15)
  })
  test('decimal mode has no safe-integer cap', () => {
    expect(parseNumberInput('9007199254740992', DEC)).toBe(9007199254740992)
  })
})

describe('parseNumberInput: rejected garbage', () => {
  const REJECT = [
    '5k', '12abc', 'abc', '-1', '-0', '+5', '0x10', 'Infinity', 'NaN', '1e', 'e5',
    '.', '1..2', '1.2.3', '1e309', '1e+', '1 2', '1e5.5', '--1', '1,,e', '٣',
  ]
  test.each(REJECT)('%s -> null in both modes', (text) => {
    expect(parseNumberInput(text, INT)).toBeNull()
    expect(parseNumberInput(text, DEC)).toBeNull()
  })
})
