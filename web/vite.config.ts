import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseVersionPy, shortSha } from './build-info'

// Version shown in the app: `_version.py` (bumped by scripts/release.py) +
// the commit being built (GITHUB_SHA in Actions, else local git, else "dev").
const APP_VERSION = parseVersionPy(
  readFileSync(resolve(__dirname, '..', '_version.py'), 'utf8'),
)

function localGitSha(): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

const BUILD_SHA = shortSha(process.env.GITHUB_SHA ?? localGitSha())

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites under <user>.github.io/<repo>/, not
  // root. Override with VITE_BASE=/ for local builds or forks under a
  // different repo name.
  base: process.env.VITE_BASE ?? '/pokeclicker-save-editor/',
  plugins: [svelte(), svelteTesting()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['tests/setup-dom.ts'],
  },
})
