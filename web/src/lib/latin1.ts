/**
 * Latin-1 (ISO-8859-1) round-trip helpers for PokeClicker saves.
 *
 * The save payload is base64-encoded JSON, but the JSON itself is NOT UTF-8 —
 * strings like "Pokémon" are stored as Latin-1 bytes (single 0xe9 for 'é').
 * We decode the base64 bytes as Latin-1 to get a JS string whose codepoints
 * match the original bytes, parse that as JSON, and reverse on encode.
 *
 * `TextDecoder` has a `'iso-8859-1'` label; `TextEncoder` does not — only
 * utf-8 is web-standard. We hand-roll the encoder, packing each
 * `charCodeAt(0)` into a byte. Input strings with codepoints > 0xff throw —
 * that's a bug, because round-tripped JSON should only contain Latin-1
 * codepoints (anything higher gets `\uXXXX`-escaped by JSON.stringify).
 */

export function bytesToLatin1(bytes: Uint8Array): string {
  return new TextDecoder('iso-8859-1').decode(bytes)
}

export function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0xff) {
      throw new RangeError(
        `latin1ToBytes: codepoint 0x${c.toString(16)} at index ${i} > 0xff; ` +
          `did the JSON string contain unescaped non-Latin-1 chars?`,
      )
    }
    out[i] = c
  }
  return out
}

export function base64ToBytes(b64: string): Uint8Array {
  // atob() returns a binary string where each char.code is the byte value.
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  // btoa() needs a binary string — one char per byte, codepoint = byte value.
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
