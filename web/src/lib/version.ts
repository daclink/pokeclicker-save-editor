/**
 * PokeClicker game-version strings.
 *
 * Saves carry `save.update.version` and the editor's data carries
 * `data/manifest.json` `gameVersion`, both plain `X.Y.Z` (the game's
 * `package.json` version). Parts compare numerically, so `0.10.26` is newer
 * than `0.9.99` — a string compare would get that backwards.
 */

/** Exactly three dot-separated non-negative integers. */
const GAME_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/

export type GameVersion = readonly [major: number, minor: number, patch: number]

/** `'0.10.26'` → `[0, 10, 26]`; anything not exactly X.Y.Z → null. */
export function parseGameVersion(version: string): GameVersion | null {
  const m = GAME_VERSION_RE.exec(version)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** -1 / 0 / 1 as `a` is older / equal / newer than `b`; null if either is unparseable. */
export function compareGameVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseGameVersion(a)
  const pb = parseGameVersion(b)
  if (!pa || !pb) return null
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}
