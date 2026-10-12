/**
 * Strict parser for the text typed into a NumberField.
 *
 * `parseInt`/`parseFloat` silently accept a numeric prefix ("5k" -> 5,
 * "1e6" -> 1 in parseInt, "1.5" -> 1), which wrote wrong values into saves
 * without telling the user. This accepts only a whole-string decimal literal
 * and returns null for anything else so the caller can reject it visibly.
 */

/**
 * A non-negative decimal literal: digits with an optional fraction ("5.",
 * ".5", "1.5") and an optional signed exponent ("1e6", "2.5E3", "1e+6").
 * No sign, no hex, no Infinity/NaN, no trailing junk.
 */
const DECIMAL_LITERAL = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

/** Thousands separators users paste in ("1,000,000"); stripped before parsing. */
const THOUSANDS_SEPARATOR = /,/g

export type ParseNumberOptions = {
  /** true: result must be a whole number <= Number.MAX_SAFE_INTEGER. */
  integer: boolean
}

/**
 * Parse `text` as a non-negative number.
 *
 * - Commas and surrounding whitespace are ignored.
 * - Blank input is 0 (matches the desktop editor's parse_int/float).
 * - Returns null when the text isn't a valid literal, the value is not
 *   finite (e.g. "1e309"), or, in integer mode, is fractional (rejected, never
 *   truncated) or above Number.MAX_SAFE_INTEGER.
 */
export function parseNumberInput(text: string, opts: ParseNumberOptions): number | null {
  const cleaned = text.replace(THOUSANDS_SEPARATOR, '').trim()
  if (cleaned === '') return 0
  if (!DECIMAL_LITERAL.test(cleaned)) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  if (opts.integer && (!Number.isInteger(n) || n > Number.MAX_SAFE_INTEGER)) return null
  return n
}
