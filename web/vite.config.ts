import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites under <user>.github.io/<repo>/, not
  // root. Override with VITE_BASE=/ for local builds or forks under a
  // different repo name.
  base: process.env.VITE_BASE ?? '/pokeclicker-save-editor/',
  plugins: [svelte()],
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
})
