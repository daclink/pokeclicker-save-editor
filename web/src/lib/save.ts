/**
 * PokeClicker save format library — TypeScript port of `pokeclicker_save.py`.
 *
 * A save export is `base64(latin1(JSON.stringify(data)))`, with the JSON
 * serialised without whitespace.
 *
 * **Round-trip contract.** The Python implementation guarantees byte-exact
 * `decode → encode` round-trips because Python preserves `int` vs `float`
 * through `json.loads`/`json.dumps`. JavaScript has only `number`, so
 * `JSON.parse` collapses `27.0` to `27` and `JSON.stringify` writes it back
 * as `27`. Real saves carry a handful of float-typed integer fields
 * (`*.durability`, `*.timeUntilDiscovery`, …) that the game accepts in
 * either form. Our contract:
 *
 *  - **Byte-exact** round-trip only on the hand-built fixture
 *    (`tests/fixtures/v0.10.25/minimal.txt`) which has no `.0` floats.
 *  - **Semantic** round-trip on real saves: `decode(encode(decode(bytes)))`
 *    deep-equals `decode(bytes)`. The output bytes will differ from input
 *    only in those `.0 → bare int` positions; the game treats them the same.
 *
 * See `web/README.md` and the test suite for the explicit assertions.
 */

import { base64ToBytes, bytesToBase64, bytesToLatin1, latin1ToBytes } from './latin1'

export type SaveData = Record<string, unknown>

export function decodeBytes(b64: string): SaveData {
  const bytes = base64ToBytes(b64.trim())
  const json = bytesToLatin1(bytes)
  return JSON.parse(json) as SaveData
}

export function encodeBytes(data: SaveData): string {
  // JSON.stringify defaults to no whitespace — matches Python's
  // `separators=(',', ':')`.
  const json = JSON.stringify(data)
  const bytes = latin1ToBytes(json)
  return bytesToBase64(bytes)
}

// --- path get/set ----------------------------------------------------------

type Selector =
  | { kind: 'key'; key: string }
  | { kind: 'index'; index: number }
  | { kind: 'match'; key: string; value: number | string | boolean }

/** Parse a path like `"a.b[3].c[id=25]"` into walk segments. */
function parsePath(path: string): Selector[] {
  const out: Selector[] = []
  let i = 0
  while (i < path.length) {
    if (path[i] === '.') {
      i++
      continue
    }
    if (path[i] === '[') {
      const end = path.indexOf(']', i)
      if (end < 0) throw new Error(`unclosed [ in path at index ${i}`)
      const inside = path.slice(i + 1, end)
      const eq = inside.indexOf('=')
      if (eq >= 0) {
        const key = inside.slice(0, eq)
        out.push({ kind: 'match', key, value: coerce(inside.slice(eq + 1)) })
      } else {
        const idx = Number(inside)
        if (!Number.isInteger(idx)) {
          throw new Error(`bad index "${inside}" in path`)
        }
        out.push({ kind: 'index', index: idx })
      }
      i = end + 1
      continue
    }
    let j = i
    while (j < path.length && path[j] !== '.' && path[j] !== '[') j++
    out.push({ kind: 'key', key: path.slice(i, j) })
    i = j
  }
  return out
}

function coerce(raw: string): number | string | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+$/.test(raw)) return Number(raw)
  if (/^-?\d*\.\d+$/.test(raw)) return Number(raw)
  return raw
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return v !== null && typeof v === 'object'
}

function step(cur: unknown, seg: Selector): unknown {
  if (!isContainer(cur)) {
    throw new Error(
      `path stops at non-container before ${JSON.stringify(seg)}`,
    )
  }
  if (seg.kind === 'key') return (cur as Record<string, unknown>)[seg.key]
  if (seg.kind === 'index') return (cur as unknown[])[seg.index]
  return (cur as unknown[]).find(
    (entry) =>
      isContainer(entry) &&
      (entry as Record<string, unknown>)[seg.key] === seg.value,
  )
}

export function getPath(data: unknown, path: string): unknown {
  let cur: unknown = data
  for (const seg of parsePath(path)) cur = step(cur, seg)
  return cur
}

export function setPath(data: unknown, path: string, value: unknown): void {
  const segs = parsePath(path)
  if (segs.length === 0) throw new Error('empty path')
  let cur: unknown = data
  for (let i = 0; i < segs.length - 1; i++) cur = step(cur, segs[i])
  const last = segs[segs.length - 1]
  if (!isContainer(cur)) throw new Error('path stops at non-container')
  if (last.kind === 'key') {
    ;(cur as Record<string, unknown>)[last.key] = value
  } else if (last.kind === 'index') {
    ;(cur as unknown[])[last.index] = value
  } else {
    throw new Error('setPath: [k=v] selector not supported as final segment')
  }
}
