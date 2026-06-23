<script lang="ts">
  // Pokédex tab — web port of pcedit_gui.PokedexTab.
  //
  // Pick a region, see its dex with caught marks, and mark uncaught pokémon
  // caught (selected rows, or the whole region). Already-caught entries are
  // left untouched. The "Also bump capture stats" toggle (off by default)
  // keeps the Trainer Card counters consistent.

  import { store } from '../lib/store.svelte'
  import { REGION_RANGES } from '../lib/data'
  import { markCaught, regionRows, type DexRow } from '../lib/pokedex'

  let tick = $state(0)
  let regionLabel = $state(REGION_RANGES[0].label)
  let uncaughtOnly = $state(false)
  let bumpStats = $state(false)
  let selected = $state<Set<number>>(new Set())

  let region = $derived(
    REGION_RANGES.find((r) => r.label === regionLabel) ?? REGION_RANGES[0],
  )

  let rows = $derived.by<DexRow[]>(() => {
    void tick
    return store.data ? regionRows(store.data, region, uncaughtOnly) : []
  })

  let caughtInRegion = $derived(rows.filter((r) => r.caught).length)
  let regionTotal = $derived(region.hi - region.lo + 1)

  function toggle(pid: number): void {
    const next = new Set(selected)
    if (next.has(pid)) next.delete(pid)
    else next.add(pid)
    selected = next
  }

  function applyMark(ids: number[]): void {
    if (!store.data || ids.length === 0) return
    try {
      const added = markCaught(store.data, ids, { bumpStats })
      store.markDirty()
      store.status = `marked ${added} caught${bumpStats ? ' (+stats)' : ''}`
      selected = new Set()
      tick++
    } catch (e) {
      store.errorDetail = e instanceof Error ? e.message : String(e)
      store.status = 'mark failed'
    }
  }

  function onMarkSelected(): void {
    applyMark([...selected].filter((pid) => !caughtSet.has(pid)))
  }

  function onMarkAllUncaught(): void {
    const ids: number[] = []
    for (let pid = region.lo; pid <= region.hi; pid++) {
      if (!caughtSet.has(pid)) ids.push(pid)
    }
    if (ids.length === 0) {
      store.status = `all ${regionTotal} in ${region.label} already caught`
      return
    }
    if (!confirm(`Mark all ${ids.length} uncaught pokémon in ${region.label} as caught?`)) {
      return
    }
    applyMark(ids)
  }

  // Caught lookup for the region, independent of the uncaughtOnly view filter.
  let caughtSet = $derived.by<Set<number>>(() => {
    void tick
    const s = new Set<number>()
    if (store.data) {
      for (const r of regionRows(store.data, region, false)) {
        if (r.caught) s.add(r.pid)
      }
    }
    return s
  })
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to edit the Pokédex.</p>
{:else}
  <section class="block">
    <p class="note">
      Pick a region, then check rows and <strong>Mark selected</strong>, or
      mark the whole region. Already-caught pokémon are left untouched.
    </p>

    <div class="controls">
      <label>
        Region:
        <select bind:value={regionLabel}>
          {#each REGION_RANGES as r (r.label)}
            <option value={r.label}>{r.label}</option>
          {/each}
        </select>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={uncaughtOnly} />
        Show uncaught only
      </label>
      <span class="status">{region.label}: {caughtInRegion}/{regionTotal} caught</span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="sel"></th>
            <th>ID</th>
            <th class="name-col">Name</th>
            <th>caught</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.pid)}
            <tr class:caught={row.caught}>
              <td class="sel">
                {#if !row.caught}
                  <input
                    type="checkbox"
                    checked={selected.has(row.pid)}
                    onchange={() => toggle(row.pid)}
                    aria-label={`Select ${row.name}`}
                  />
                {/if}
              </td>
              <td>#{row.pid}</td>
              <td class="name-col">{row.name}</td>
              <td>{row.caught ? '✓' : ''}</td>
            </tr>
          {:else}
            <tr><td colspan="4" class="muted">(no rows)</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="actions">
      <button type="button" onclick={onMarkSelected} disabled={selected.size === 0}>
        Mark selected caught ({selected.size})
      </button>
      <button type="button" onclick={onMarkAllUncaught}>
        Mark all uncaught in {region.label}
      </button>
      <label class="check bump">
        <input type="checkbox" bind:checked={bumpStats} />
        Also bump capture stats (totalPokemonCaptured, pokemonCaptured.&lt;id&gt;, …)
      </label>
    </div>
  </section>
{/if}

<style>
  .empty {
    color: #666;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 6px;
  }
  .block {
    margin-bottom: 1.25rem;
    padding: 1rem 1.25rem;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    background: #fafafa;
  }
  .note {
    margin: 0 0 0.75rem;
    color: #666;
    font-size: 0.9em;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  .controls select {
    font: inherit;
    padding: 0.25rem 0.4rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-left: 0.25rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.9em;
    color: #444;
  }
  .status {
    margin-left: auto;
    color: #444;
    font-size: 0.9em;
  }

  .table-wrap {
    max-height: 28rem;
    overflow-y: auto;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    background: white;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  thead {
    position: sticky;
    top: 0;
    background: #f5f5f5;
    z-index: 1;
  }
  th,
  td {
    padding: 0.3rem 0.5rem;
    text-align: center;
    border-bottom: 1px solid #eee;
  }
  .sel {
    width: 2rem;
  }
  .name-col {
    text-align: left;
  }
  tbody tr.caught {
    color: #888;
  }
  .muted {
    color: #999;
  }

  .actions {
    margin-top: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .actions button {
    padding: 0.35rem 0.8rem;
    border: 1px solid #ccc;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    font-size: 0.9em;
  }
  .actions button:hover:not(:disabled) {
    background: #f0f0f0;
  }
  .actions button:disabled {
    color: #aaa;
    cursor: not-allowed;
  }
  .bump {
    margin-left: 0.5rem;
  }
</style>
