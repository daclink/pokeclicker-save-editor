<script lang="ts">
  // Browse / Save / status. Matches the desktop editor's row layout for
  // muscle memory. The save button downloads a fresh .txt — the browser
  // can't overwrite the original file in place. Re-import it in PokeClicker
  // manually.
  import { store } from '../lib/store.svelte'

  function onPick(evt: Event): void {
    const input = evt.target as HTMLInputElement
    if (input.files?.[0]) void store.load(input.files[0])
    // Reset so picking the same file twice still triggers onchange.
    input.value = ''
  }

  function onSave(): void {
    store.download()
  }
</script>

<div class="topbar">
  <div class="row path">
    <span class="key">Save:</span>
    <span class="value">{store.fileName ?? '(no file)'}</span>
    {#if store.isDirty}<span class="dirty">●&nbsp;unsaved</span>{/if}
  </div>
  <div class="row actions">
    <label class="button primary">
      <input type="file" accept=".txt" onchange={onPick} />
      Browse…
    </label>
    <button
      type="button"
      class="button"
      onclick={onSave}
      disabled={store.data === null}
    >
      Save (download)
    </button>
  </div>
  <p class="status">{store.status}</p>
  {#if store.errorDetail}
    <pre class="error">{store.errorDetail}</pre>
  {/if}
</div>

<style>
  .topbar {
    border-bottom: 1px solid #e5e5e5;
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }
  .key {
    color: #666;
    font-size: 0.9em;
  }
  .value {
    color: #222;
    font-family: ui-monospace, monospace;
    font-size: 0.9em;
  }
  .dirty {
    color: #c92a2a;
    font-size: 0.85em;
    margin-left: 0.5rem;
  }
  .actions {
    margin-top: 0.5rem;
  }
  .button {
    display: inline-block;
    padding: 0.4rem 0.9rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font: inherit;
    font-size: 0.95em;
  }
  .button:hover:not(:disabled) {
    background: #f0f0f0;
  }
  .button:disabled {
    color: #999;
    cursor: not-allowed;
  }
  .button.primary {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }
  .button.primary:hover {
    background: #1d4ed8;
  }
  .button input[type='file'] {
    display: none;
  }
  .status {
    margin: 0.5rem 0 0;
    color: #444;
    font-size: 0.9em;
  }
  .error {
    margin: 0.5rem 0 0;
    padding: 0.5rem;
    background: #fee;
    color: #900;
    white-space: pre-wrap;
    border-radius: 4px;
    font-size: 0.85em;
  }
</style>
