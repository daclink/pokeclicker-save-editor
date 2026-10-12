<script lang="ts">
  // Underground tab — treasures, plates, fossils and special loot, all plain
  // counts in player._itemList. Rosters come from the game's
  // UndergroundItems.ts (data/underground-items.json via lib/underground.ts);
  // writes go through lib/inventory.ts (0 deletes the key). Shards, evolution
  // stones and mega stones are mined here too but edited on their own tabs.

  import { store } from '../lib/store.svelte'
  import { readItemCounts, setItemCount, setItemCounts } from '../lib/inventory'
  import {
    UNDERGROUND_CATEGORIES,
    UNDERGROUND_EDITED_ELSEWHERE,
    undergroundKeys,
  } from '../lib/underground'
  import Card from '../components/ui/Card.svelte'
  import SectionHeader from '../components/ui/SectionHeader.svelte'
  import ItemCountGrid from '../components/ItemCountGrid.svelte'
  import SimpleIntDialog from '../components/SimpleIntDialog.svelte'

  /** Quick-fill presets offered under each count grid. */
  const FILL_PRESETS: readonly number[] = [0, 10, 100]

  const categories = UNDERGROUND_CATEGORIES.map((c) => ({ ...c, keys: undergroundKeys(c) }))
  const allKeys = categories.flatMap((c) => c.keys)
  const elsewhereTabs = [...new Set(Object.values(UNDERGROUND_EDITED_ELSEWHERE))]

  let tick = $state(0)

  let counts = $derived.by(() => {
    void tick
    return store.data ? readItemCounts(store.data, allKeys) : {}
  })

  let setAllDialog = $state<{ open: (t: string, p: string, d?: number) => Promise<number | null> }>()

  function refreshAfter(fn: () => void, status?: string): void {
    if (!store.data) return
    try {
      fn()
      store.markDirty()
      if (status) store.status = status
      tick++
    } catch (e) {
      store.errorDetail = e instanceof Error ? e.message : String(e)
      store.status = 'invalid value rejected'
    }
  }

  function fillAll(keys: readonly string[], n: number, label: string): void {
    refreshAfter(() => setItemCounts(store.data!, keys, n), `${label}: all set to ${n}`)
  }

  async function promptFillAll(keys: readonly string[], label: string): Promise<void> {
    if (!setAllDialog) return
    const n = await setAllDialog.open('Set all', `Set every ${label.toLowerCase()} count to:`, 0)
    if (n !== null) fillAll(keys, n, label)
  }
</script>

{#if store.data !== null}
  <p class="note">
    Shards, evolution stones and mega stones also come from the Underground —
    edit them on the {elsewhereTabs.map((t) => `${t} tab`).join(' and ')}.
  </p>

  {#each categories as cat (cat.id)}
    <section class="block">
      <Card>
        <SectionHeader title={cat.label} description={`${cat.description} 0 removes the item.`} />
        <ItemCountGrid
          keys={cat.keys}
          {counts}
          onCommit={(key, n) => refreshAfter(() => setItemCount(store.data!, key, n))}
        />
        <div class="actions">
          {#each FILL_PRESETS as n (n)}
            <button type="button" onclick={() => fillAll(cat.keys, n, cat.label)}>All to {n}</button>
          {/each}
          <button type="button" onclick={() => promptFillAll(cat.keys, cat.label)}>Set all to…</button>
        </div>
      </Card>
    </section>
  {/each}
{/if}

<SimpleIntDialog bind:ref={setAllDialog} />

<style>
  .note {
    margin: 0 0 var(--space-4);
    color: var(--text-muted);
    font-size: 0.9em;
  }
  .block {
    margin-bottom: var(--space-5);
  }
  .actions {
    margin-top: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .actions button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font: inherit;
    font-size: 0.9em;
  }
  .actions button:hover {
    border-color: var(--text-muted);
  }
</style>
