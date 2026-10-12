<script lang="ts">
  // Pokédex tab — web port of pcedit_gui.PokedexTab.
  //
  // Pick a region, see its dex with caught marks, and mark uncaught pokémon
  // caught (selected rows, or the whole region). Already-caught entries are
  // left untouched. "Show forms" lists each species' alternate forms
  // (fractional ids like Unown 201.06) under it. The filter box matches a
  // name or an id prefix, and the ID/Name headers sort (click again to
  // reverse); both only change the view — selections survive them. The
  // "Also bump capture stats" toggle (off by default) keeps the Trainer Card
  // counters consistent.

  import { store } from '../lib/store.svelte'
  import { ALL_REGIONS, DATA_GAME_VERSION, DEX_REGION_OPTIONS, REGION_RANGES } from '../lib/data'
  import { saveGameVersion } from '../lib/quests'
  import {
    exactIdFirst,
    filterRows,
    formsMarkableFor,
    isFormId,
    markCaught,
    regionRows,
    sortRows,
    type DexRow,
    type DexSortKey,
    type SortDir,
  } from '../lib/pokedex'

  /** Sortable columns, in header order. */
  const SORT_COLUMNS: readonly { key: DexSortKey; label: string }[] = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
  ]
  const SORT_ARROW: Record<SortDir, string> = { asc: '▲', desc: '▼' }
  const ARIA_SORT: Record<SortDir, 'ascending' | 'descending'> = {
    asc: 'ascending',
    desc: 'descending',
  }

  let tick = $state(0)
  let regionLabel = $state(REGION_RANGES[0].label)
  let uncaughtOnly = $state(false)
  let bumpStats = $state(false)
  let showForms = $state(false)
  let selected = $state<Set<number>>(new Set())
  let query = $state('')
  let sortKey = $state<DexSortKey>('id')
  let sortDir = $state<SortDir>('asc')

  let region = $derived(
    DEX_REGION_OPTIONS.find((r) => r.label === regionLabel) ?? REGION_RANGES[0],
  )

  /** "in Kanto" vs "across all regions" — reads naturally in button/status copy. */
  let regionPhrase = $derived(
    region === ALL_REGIONS ? 'across all regions' : `in ${region.label}`,
  )

  // Unfiltered rows for the region (forms included when toggled). Totals,
  // the caught lookup and "mark all" all derive from this, so the confirm
  // count always matches what gets written.
  let allRows = $derived.by<DexRow[]>(() => {
    void tick
    return store.data ? regionRows(store.data, region, false, { includeForms: showForms }) : []
  })
  // Filter, then sort, then (for an id query) lift the exact species to the top.
  let rows = $derived(
    exactIdFirst(
      sortRows(filterRows(uncaughtOnly ? allRows.filter((r) => !r.caught) : allRows, query), sortKey, sortDir),
      query,
    ),
  )
  let filtering = $derived(query.trim() !== '')
  let caughtSet = $derived(new Set(allRows.filter((r) => r.caught).map((r) => r.pid)))

  // Forms come from the editor's data release; a save from an older game
  // build may not have them, so markCaught skips form ids there.
  let formsBlocked = $derived(store.data ? !formsMarkableFor(store.data) : false)
  let saveVersion = $derived(store.data ? saveGameVersion(store.data) : null)

  let caughtInRegion = $derived(caughtSet.size)
  let regionTotal = $derived(allRows.length)

  /** Click a header: sort by it ascending, or flip direction if already active. */
  function sortBy(key: DexSortKey): void {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    else {
      sortKey = key
      sortDir = 'asc'
    }
  }

  function toggle(pid: number): void {
    const next = new Set(selected)
    if (next.has(pid)) next.delete(pid)
    else next.add(pid)
    selected = next
  }

  /** Drop form ids when the save is older than the data (markCaught would skip
   *  them anyway); `skipped` is how many were dropped, for the status line. */
  function splitMarkable(ids: number[]): { markable: number[]; skipped: number } {
    const markable = formsBlocked ? ids.filter((pid) => !isFormId(pid)) : ids
    return { markable, skipped: ids.length - markable.length }
  }

  function skippedNote(skipped: number): string {
    if (skipped === 0) return ''
    return `; skipped ${skipped} form${skipped === 1 ? '' : 's'} (save v${saveVersion} is older than data v${DATA_GAME_VERSION})`
  }

  function applyMark(ids: number[], skipped: number): void {
    if (!store.data) return
    if (ids.length === 0) {
      if (skipped) store.status = `marked 0 caught${skippedNote(skipped)}`
      return
    }
    try {
      const added = markCaught(store.data, ids, { bumpStats })
      store.markDirty()
      store.status = `marked ${added} caught${bumpStats ? ' (+stats)' : ''}${skippedNote(skipped)}`
      selected = new Set()
      tick++
    } catch (e) {
      store.errorDetail = e instanceof Error ? e.message : String(e)
      store.status = 'mark failed'
    }
  }

  function onMarkSelected(): void {
    // Only rows still listed — a form selected before "Show forms" was
    // unticked must not be marked invisibly.
    const listed = new Set(allRows.map((r) => r.pid))
    const { markable, skipped } = splitMarkable(
      [...selected].filter((pid) => listed.has(pid) && !caughtSet.has(pid)),
    )
    applyMark(markable, skipped)
  }

  function onMarkAllUncaught(): void {
    const { markable: ids, skipped } = splitMarkable(
      allRows.filter((r) => !r.caught).map((r) => r.pid),
    )
    if (ids.length === 0) {
      store.status = skipped
        ? `marked 0 caught${skippedNote(skipped)}`
        : `all ${regionTotal} ${regionPhrase} already caught`
      return
    }
    if (!confirm(`Mark all ${ids.length} uncaught pokémon ${regionPhrase} as caught?`)) {
      return
    }
    applyMark(ids, skipped)
  }

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
          {#each DEX_REGION_OPTIONS as r (r.label)}
            <option value={r.label}>{r.label}</option>
          {/each}
        </select>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={uncaughtOnly} />
        Show uncaught only
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={showForms} />
        Show forms (Unown letters, Alcremie flavors, …)
      </label>
      <input
        class="filter"
        type="search"
        bind:value={query}
        placeholder="Filter by name or #"
        aria-label="Filter by name or #"
      />
      <span class="status">
        {region.label}: {caughtInRegion}/{regionTotal} caught{#if filtering}{` · showing ${rows.length} of ${regionTotal}`}{/if}
      </span>
    </div>

    {#if showForms && formsBlocked}
      <p class="note warn">
        Forms won't be marked caught: your save is from PokeClicker
        v{saveVersion}, older than this editor's data (v{DATA_GAME_VERSION}),
        so your game may not have them. Update the game, then re-export.
      </p>
    {/if}

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="sel"></th>
            {#each SORT_COLUMNS as col (col.key)}
              <th
                class:name-col={col.key === 'name'}
                aria-sort={sortKey === col.key ? ARIA_SORT[sortDir] : 'none'}
              >
                <button type="button" class="sort" onclick={() => sortBy(col.key)}>
                  {col.label}
                  <span class="arrow" aria-hidden="true">{sortKey === col.key ? SORT_ARROW[sortDir] : ''}</span>
                </button>
              </th>
            {/each}
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
        Mark all uncaught {regionPhrase}
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
    color: var(--text-muted);
    padding: var(--space-4);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
  }
  .block {
    margin-bottom: var(--space-4);
    padding: var(--space-4) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
  }
  .note {
    margin: 0 0 var(--space-3);
    color: var(--text-muted);
    font-size: 0.9em;
  }
  .note.warn {
    color: var(--danger);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
    margin-bottom: var(--space-3);
  }
  .controls select {
    font: inherit;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    border-radius: var(--radius-xs);
    margin-left: var(--space-1);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.9em;
    color: var(--text-muted);
  }
  .filter {
    font: inherit;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    min-width: 12rem;
  }
  th .sort {
    font: inherit;
    font-weight: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  th .arrow {
    font-size: 0.75em;
  }
  .status {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 0.9em;
  }

  .table-wrap {
    max-height: 28rem;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  thead {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    z-index: 1;
  }
  th,
  td {
    padding: var(--space-1) var(--space-2);
    text-align: center;
    border-bottom: 1px solid var(--border);
  }
  .sel {
    width: 2rem;
  }
  .name-col {
    text-align: left;
  }
  tbody tr.caught {
    color: var(--text-muted);
  }
  .muted {
    color: var(--text-muted);
  }

  .actions {
    margin-top: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .actions button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    border-radius: var(--radius-xs);
    cursor: pointer;
    font: inherit;
    font-size: 0.9em;
  }
  .actions button:hover:not(:disabled) {
    border-color: var(--text-muted);
  }
  .actions button:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }
  .bump {
    margin-left: var(--space-2);
  }
</style>
