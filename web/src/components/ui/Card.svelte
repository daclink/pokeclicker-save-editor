<script lang="ts">
  // Surface container: the standard panel used across the app.
  import type { Snippet } from 'svelte'
  let { children }: { children: Snippet } = $props()
</script>

<div class="card">
  {@render children()}
</div>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-4);
    box-shadow: var(--shadow-sm);
  }
</style>
