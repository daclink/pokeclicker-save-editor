/**
 * Build-time version info for the web app (used by vite.config.ts).
 *
 * The version comes from the repo's `_version.py` — the single constant
 * scripts/release.py bumps — so the app and the tagged release can't drift.
 * The commit sha tells you exactly which build is live between releases.
 */

export const REPO_URL = 'https://github.com/daclink/pokeclicker-save-editor'

/** Placeholder sha for builds outside git / CI. */
export const DEV_SHA = 'dev'

const SHORT_SHA_LENGTH = 7
const VERSION_ASSIGNMENT = /^__version__\s*=\s*(['"])(\d+\.\d+\.\d+)\1\s*$/m
const HEX_SHA = /^[0-9a-f]{7,40}$/i

/** Extract `__version__ = "X.Y.Z"` from `_version.py`; throws if absent. */
export function parseVersionPy(src: string): string {
  const m = src.match(VERSION_ASSIGNMENT)
  if (!m) throw new Error('_version.py: no `__version__ = "X.Y.Z"` assignment found')
  return m[2]
}

/** First 7 chars of a hex commit sha, or `DEV_SHA` if missing/invalid. */
export function shortSha(sha: string | undefined): string {
  const s = (sha ?? '').trim()
  return HEX_SHA.test(s) ? s.slice(0, SHORT_SHA_LENGTH).toLowerCase() : DEV_SHA
}

/** Human label shown in the app, e.g. `v0.9.0 · 678f4b0`. */
export function buildLabel(version: string, sha: string): string {
  return `v${version} · ${sha}`
}

/** GitHub commit URL for a real sha; `null` for dev builds. */
export function commitUrl(sha: string): string | null {
  return sha === DEV_SHA ? null : `${REPO_URL}/commit/${sha}`
}
