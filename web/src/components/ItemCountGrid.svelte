<script lang="ts">
  // Compact labelled count grid for `_itemList` items (egg items, evolution
  // items, …). Commit-on-blur like the Shards grid: invalid text snaps back,
  // unchanged values are a no-op, and the parent decides how to write
  // (the Inventory helpers delete keys at 0).
  import { itemDisplayName } from '../lib/data'

  type Props = {
    /** `_itemList` keys, in display order. */
    keys: readonly string[]
    /** Current counts keyed by item key (missing → 0). */
    counts: Readonly<Record<string, number>>
    /** Called with a validated non-negative integer that differs from the current count. */
    onCommit: (key: string, n: number) => void
  }

  let { keys, counts, onCommit }: Props = $props()

  /** In-flight text per cell, re-synced whenever `counts` changes. */
  let text = $state<Record<string, string>>({})

  $effect(() => {
    text = Object.fromEntries(keys.map((k) => [k, String(counts[k] ?? 0)]))
  })

  function parseCount(raw: string): number | null {
    const cleaned = raw.replace(/,/g, '').trim()
    if (cleaned === '') return 0
    if (!/^\d+$/.test(cleaned)) return null
    return Number.parseInt(cleaned, 10)
  }

  function commit(key: string): void {
    const current = counts[key] ?? 0
    const n = parseCount(text[key] ?? '')
    if (n === null) {
      text[key] = String(current)
      return
    }
    if (n !== current) onCommit(key, n)
  }

  function onKey(evt: KeyboardEvent): void {
    if (evt.key === 'Enter' || evt.key === 'Escape') {
      ;(evt.target as HTMLInputElement).blur()
    }
  }
</script>

<div class="grid">
  {#each keys as key (key)}
    <label class="cell" class:owned={(counts[key] ?? 0) > 0}>
      <span class="name">{itemDisplayName(key)}</span>
      <input
        type="text"
        inputmode="numeric"
        bind:value={text[key]}
        onblur={() => commit(key)}
        onkeydown={onKey}
        aria-label={`${itemDisplayName(key)} count`}
      />
    </label>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: var(--space-2) var(--space-3);
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .name {
    color: var(--text-muted);
    font-size: 0.85em;
  }
  .cell.owned .name {
    color: var(--text);
  }
  input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    text-align: right;
  }
  input:focus {
    outline: 2px solid var(--focus-ring);
    outline-offset: -1px;
  }
</style>
