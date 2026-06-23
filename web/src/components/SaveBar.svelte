<script lang="ts">
  // Save status + actions, top of the main column. Browse downloads a fresh
  // .txt (the browser can't write the original in place). Includes the theme
  // toggle. Refactor of the old TopBar, now token-driven.
  import { store } from '../lib/store.svelte'
  import { theme } from '../lib/theme.svelte'

  function onPick(evt: Event): void {
    const input = evt.target as HTMLInputElement
    if (input.files?.[0]) void store.load(input.files[0])
    input.value = ''
  }
</script>

<div class="savebar">
  <div class="left">
    <label class="button primary">
      <input type="file" accept=".txt" onchange={onPick} />
      Browse…
    </label>
    <button
      type="button"
      class="button"
      onclick={() => store.download()}
      disabled={store.data === null}
    >
      Save (download)
    </button>
    <span class="file">{store.fileName ?? '(no file)'}</span>
    {#if store.isDirty}<span class="dirty">● unsaved</span>{/if}
  </div>
  <button
    type="button"
    class="button theme"
    aria-label="Toggle light/dark theme"
    onclick={() => theme.toggle()}
  >
    {theme.current === 'dark' ? '☾' : '☀'}
  </button>
</div>

{#if store.status}<p class="status">{store.status}</p>{/if}
{#if store.errorDetail}<pre class="error">{store.errorDetail}</pre>{/if}

<style>
  .savebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  .left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 0.9rem;
  }
  .button:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .button:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }
  .button.primary {
    background: var(--brand);
    color: var(--brand-contrast);
    border-color: var(--brand);
    font-weight: 600;
  }
  .button input[type='file'] {
    display: none;
  }
  .theme {
    padding: var(--space-2) var(--space-3);
  }
  .file {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.85rem;
  }
  .dirty {
    color: var(--warning);
    font-size: 0.85rem;
  }
  .status {
    margin: var(--space-2) 0 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .error {
    margin: var(--space-2) 0 0;
    padding: var(--space-2);
    background: color-mix(in srgb, var(--danger) 15%, transparent);
    color: var(--danger);
    white-space: pre-wrap;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
  }
</style>
