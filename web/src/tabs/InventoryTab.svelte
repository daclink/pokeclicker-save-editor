<script lang="ts">
  // Inventory tab — egg items, evolution items and mega stones, all plain
  // counts in player._itemList. Rosters come from PokeClicker's enums (see
  // data/*-items.json, data/mega-stones.json); writes go through
  // lib/inventory.ts (0 deletes the key; a mega stone is exactly 1 or absent).

  import { store } from '../lib/store.svelte'
  import { EGG_ITEMS, EVOLUTION_ITEMS, itemDisplayName } from '../lib/data'
  import {
    readItemCounts,
    readMegaStones,
    setItemCount,
    setItemCounts,
    setMegaStone,
    setMegaStones,
    type MegaStoneRow,
  } from '../lib/inventory'
  import Card from '../components/ui/Card.svelte'
  import SectionHeader from '../components/ui/SectionHeader.svelte'
  import ItemCountGrid from '../components/ItemCountGrid.svelte'
  import SimpleIntDialog from '../components/SimpleIntDialog.svelte'

  /** Quick-fill presets offered under each count grid. */
  const FILL_PRESETS: readonly number[] = [0, 10, 100]

  let tick = $state(0)

  let eggCounts = $derived.by(() => {
    void tick
    return store.data ? readItemCounts(store.data, EGG_ITEMS) : {}
  })
  let evolutionCounts = $derived.by(() => {
    void tick
    return store.data ? readItemCounts(store.data, EVOLUTION_ITEMS) : {}
  })
  let megaRows = $derived.by<MegaStoneRow[]>(() => {
    void tick
    return store.data ? readMegaStones(store.data) : []
  })

  let ownedCount = $derived(megaRows.filter((r) => r.owned).length)
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

  function giveMegaStones(filter: (r: MegaStoneRow) => boolean, owned: boolean): void {
    const stones = megaRows.filter(filter).map((r) => r.stone)
    if (stones.length === 0) return
    const verb = owned ? 'gave' : 'removed'
    refreshAfter(
      () => setMegaStones(store.data!, stones, owned),
      `${verb} ${stones.length} mega stone${stones.length === 1 ? '' : 's'}`,
    )
  }
</script>

{#snippet fillActions(keys: readonly string[], label: string)}
  <div class="actions">
    {#each FILL_PRESETS as n (n)}
      <button type="button" onclick={() => fillAll(keys, n, label)}>All to {n}</button>
    {/each}
    <button type="button" onclick={() => promptFillAll(keys, label)}>Set all to…</button>
  </div>
{/snippet}

{#if store.data !== null}
  <section class="block">
    <Card>
      <SectionHeader
        title="Egg items"
        description="Standalone egg items you hatch from the item bag (player._itemList) — not the breeding queue on the Eggs tab. 0 removes the item."
      />
      <ItemCountGrid
        keys={EGG_ITEMS}
        counts={eggCounts}
        onCommit={(key, n) => refreshAfter(() => setItemCount(store.data!, key, n))}
      />
      {@render fillActions(EGG_ITEMS, 'Egg items')}
    </Card>
  </section>

  <section class="block">
    <Card>
      <SectionHeader
        title="Evolution items"
        description="Evolution stones and evolution/trade held items (StoneType). 0 removes the item."
      />
      <ItemCountGrid
        keys={EVOLUTION_ITEMS}
        counts={evolutionCounts}
        onCommit={(key, n) => refreshAfter(() => setItemCount(store.data!, key, n))}
      />
      {@render fillActions(EVOLUTION_ITEMS, 'Evolution items')}
    </Card>
  </section>

  <section class="block">
    <Card>
      <SectionHeader
        title="Mega stones"
        description="Owning a stone lets its pokémon mega-evolve in-game. The game stores each stone once (count 1); unchecking removes it."
      />
      <div class="header">
        <span class="count-pill">{ownedCount} / {megaRows.length} owned</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="check-col">Owned</th>
              <th class="name-col">Stone</th>
              <th class="name-col">Pokémon</th>
              <th>Pokémon caught</th>
            </tr>
          </thead>
          <tbody>
            {#each megaRows as row (row.stone)}
              <tr class:owned={row.owned}>
                <td class="check-col">
                  <input
                    type="checkbox"
                    checked={row.owned}
                    onchange={(e) =>
                      refreshAfter(() =>
                        setMegaStone(store.data!, row.stone, (e.currentTarget as HTMLInputElement).checked),
                      )}
                    aria-label={`Own ${itemDisplayName(row.stone)}`}
                  />
                </td>
                <td class="name-col">{itemDisplayName(row.stone)}</td>
                <td class="name-col">{row.base}</td>
                <td class:muted={!row.baseCaught}>{row.baseCaught ? '✓' : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="actions">
        <button type="button" onclick={() => giveMegaStones((r) => r.baseCaught && !r.owned, true)}>
          Give for caught pokémon
        </button>
        <button type="button" onclick={() => giveMegaStones((r) => !r.owned, true)}>Give all</button>
        <button type="button" onclick={() => giveMegaStones((r) => r.owned, false)}>Remove all</button>
      </div>
    </Card>
  </section>
{/if}

<SimpleIntDialog bind:ref={setAllDialog} />

<style>
  .block {
    margin-bottom: var(--space-5);
  }
  .header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-2);
  }
  .count-pill {
    font-size: 0.85em;
    color: var(--text-muted);
    padding: 0.1rem var(--space-2);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
  }
  .table-wrap {
    max-height: 26rem;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
    color: var(--text);
  }
  thead {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    z-index: 1;
  }
  th,
  td {
    padding: 0.3rem var(--space-2);
    text-align: center;
    border-bottom: 1px solid var(--border);
  }
  th {
    font-weight: 500;
  }
  .name-col {
    text-align: left;
  }
  .check-col {
    width: 4.5rem;
  }
  tr.owned {
    background: var(--selected-bg);
  }
  .muted {
    color: var(--text-muted);
  }
  .actions {
    margin-top: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .actions button {
    padding: 0.35rem 0.8rem;
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
