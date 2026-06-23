<script lang="ts">
  // Label + control row — the dominant editing pattern across tabs.
  import type { Snippet } from 'svelte'
  let {
    label,
    children,
  }: { label: string; children: Snippet } = $props()
</script>

<label class="field-row">
  <span class="label">{label}</span>
  <span class="control">{@render children()}</span>
</label>

<style>
  .field-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border);
  }
  .field-row:last-child {
    border-bottom: none;
  }
  .label {
    color: var(--text);
    font-size: 0.9rem;
  }
  .control {
    font-family: var(--font-mono);
  }
</style>
