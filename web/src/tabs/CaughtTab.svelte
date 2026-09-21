<script lang="ts">
  // Caught Pokémon tab — port of pcedit_gui.CaughtTab + CaughtDialog, plus
  // bulk editing.
  //
  // Check rows (or click them) to select; the header checkbox selects every
  // *visible* row, so the region/type filters scope bulk actions. Bulk bar:
  // shiny on/off, pokérus level, atkBonus 100. Double-click a row to edit it.
  // Sortable column headers; numeric columns sort numerically.

  import { store } from '../lib/store.svelte'
  import {
    POKERUS,
    POKERUS_LABELS,
    POKERUS_RESISTANT_EVS,
    readCaughtRows,
    setCaughtAtkBonus,
    setCaughtEntry,
    setCaughtPokerus,
    setCaughtShiny,
    type CaughtPatch,
    type CaughtRow,
  } from '../lib/caught'
  import NumberField from '../components/NumberField.svelte'
  import Card from '../components/ui/Card.svelte'
  import {
    POKEMON_TYPE_NAMES,
    REGION_RANGES,
    regionFor,
    typeNamesFor,
  } from '../lib/data'

  const pokerusLabel = (n: number): string => POKERUS_LABELS[n] ?? String(n)

  /** atkBonus the quick action sets (four hatches' worth of +25). */
  const QUICK_ATK_BONUS = 100

  // --- reactive state ----------------------------------------------------

  let tick = $state(0)
  /** Checked rows (party ids, including fractional form ids). */
  let selected = $state(new Set<number>())
  /** Row open in the edit dialog — independent of the checkbox selection. */
  let editId = $state<number | null>(null)
  /** Level the bulk pokérus control will apply. */
  let bulkPokerus = $state<number>(POKERUS.Contagious)

  type SortCol = 'id' | 'name' | 'atkBonus' | 'pokerus' | 'exp' | 'inEgg' | 'shiny'
  let sortCol = $state<SortCol>('id')
  let sortReverse = $state(false)

  const NUMERIC_COLS: ReadonlySet<SortCol> = new Set(['id', 'atkBonus', 'pokerus', 'exp'])
  const BOOL_COLS: ReadonlySet<SortCol> = new Set(['inEgg', 'shiny'])

  // Filters ('' = no filter). Region by dex range; type1/type2 each match if
  // the species' type set contains the chosen type. Selects use value +
  // onchange rather than bind:value: Svelte's select binding reads `:checked`,
  // which happy-dom doesn't implement, so bind:value can't be component-tested.
  let filterRegion = $state('')
  let filterType1 = $state('')
  let filterType2 = $state('')

  let rows = $derived.by<CaughtRow[]>(() => {
    void tick
    return store.data ? readCaughtRows(store.data) : []
  })

  let filteredRows = $derived.by<CaughtRow[]>(() => {
    if (!filterRegion && !filterType1 && !filterType2) return rows
    return rows.filter((r) => {
      if (filterRegion && regionFor(r.id) !== filterRegion) return false
      if (filterType1 || filterType2) {
        const types = typeNamesFor(r.id)
        if (filterType1 && !types.includes(filterType1)) return false
        if (filterType2 && !types.includes(filterType2)) return false
      }
      return true
    })
  })

  let viewRows = $derived.by<CaughtRow[]>(() => {
    const out = filteredRows.slice()
    out.sort((a, b) => {
      let av: number | string
      let bv: number | string
      if (BOOL_COLS.has(sortCol)) {
        av = a[sortCol] ? 1 : 0
        bv = b[sortCol] ? 1 : 0
      } else if (NUMERIC_COLS.has(sortCol)) {
        av = a[sortCol] as number
        bv = b[sortCol] as number
      } else {
        av = String(a[sortCol])
        bv = String(b[sortCol])
      }
      if (av < bv) return sortReverse ? 1 : -1
      if (av > bv) return sortReverse ? -1 : 1
      return 0
    })
    return out
  })

  let editRow = $derived(
    editId !== null ? rows.find((r) => r.id === editId) ?? null : null,
  )

  let visibleAllSelected = $derived(
    viewRows.length > 0 && viewRows.every((r) => selected.has(r.id)),
  )

  /** Selected ids that still exist in the save, in a stable order. */
  let selectedIds = $derived(rows.filter((r) => selected.has(r.id)).map((r) => r.id))

  // --- mutation plumbing -------------------------------------------------

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

  function toggleSort(col: SortCol): void {
    if (sortCol === col) sortReverse = !sortReverse
    else {
      sortCol = col
      sortReverse = false
    }
  }

  function sortIndicator(col: SortCol): string {
    if (sortCol !== col) return ''
    return sortReverse ? ' ↓' : ' ↑'
  }

  // --- selection ---------------------------------------------------------

  function toggleSelected(id: number): void {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected = next
  }

  function toggleSelectAllVisible(): void {
    const next = new Set(selected)
    if (visibleAllSelected) for (const r of viewRows) next.delete(r.id)
    else for (const r of viewRows) next.add(r.id)
    selected = next
  }

  function clearSelection(): void {
    selected = new Set()
  }

  // --- bulk actions ------------------------------------------------------

  function plural(n: number): string {
    return `${n} pokémon`
  }

  function onBulkShiny(on: boolean): void {
    const ids = selectedIds
    refreshAfter(
      () => setCaughtShiny(store.data!, ids, on),
      `shiny ${on ? 'on' : 'off'} for ${plural(ids.length)}`,
    )
  }

  function onBulkPokerus(): void {
    const ids = selectedIds
    const level = bulkPokerus
    refreshAfter(
      () => setCaughtPokerus(store.data!, ids, level),
      `pokérus ${pokerusLabel(level)} for ${plural(ids.length)}`,
    )
  }

  function onBulkAtkBonus(): void {
    const ids = selectedIds
    refreshAfter(
      () => setCaughtAtkBonus(store.data!, ids, QUICK_ATK_BONUS),
      `atkBonus ${QUICK_ATK_BONUS} for ${plural(ids.length)}`,
    )
  }

  // --- edit dialog --------------------------------------------------------

  let dialogEl: HTMLDialogElement | undefined = $state()
  let draft: CaughtPatch = $state({})

  function openEdit(id: number): void {
    editId = id
    const row = rows.find((r) => r.id === id)
    if (!row) return
    draft = {
      atkBonus: row.atkBonus,
      pokerus: row.pokerus,
      exp: row.exp,
      inEgg: row.inEgg,
      shiny: row.shiny,
    }
    dialogEl?.showModal()
  }

  function onEditSelected(): void {
    if (selectedIds.length === 1) openEdit(selectedIds[0])
  }

  function closeEdit(): void {
    dialogEl?.close()
  }

  function saveEdit(): void {
    if (editId === null) {
      closeEdit()
      return
    }
    const id = editId
    const patch = { ...draft }
    refreshAfter(() => setCaughtEntry(store.data!, id, patch))
    closeEdit()
  }
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to edit caught pokémon.</p>
{:else}
  <section class="block">
    <Card>
    <p class="note">
      Check rows (or click them) to select; the header box selects every visible
      row, so filters narrow bulk edits. Double-click a row to edit it.
      atkBonus increments by 25 per hatch.
    </p>

    <div class="filters">
      <label>
        Region
        <select value={filterRegion} onchange={(e) => (filterRegion = e.currentTarget.value)}>
          <option value="">All</option>
          {#each REGION_RANGES as r (r.label)}
            <option value={r.label}>{r.label}</option>
          {/each}
        </select>
      </label>
      <label>
        Type 1
        <select value={filterType1} onchange={(e) => (filterType1 = e.currentTarget.value)}>
          <option value="">Any</option>
          {#each POKEMON_TYPE_NAMES as t (t)}
            <option value={t}>{t}</option>
          {/each}
        </select>
      </label>
      <label>
        Type 2
        <select value={filterType2} onchange={(e) => (filterType2 = e.currentTarget.value)}>
          <option value="">Any</option>
          {#each POKEMON_TYPE_NAMES as t (t)}
            <option value={t}>{t}</option>
          {/each}
        </select>
      </label>
      {#if filterRegion || filterType1 || filterType2}
        <button type="button" class="clear" onclick={() => { filterRegion = ''; filterType1 = ''; filterType2 = '' }}>
          Clear
        </button>
        <span class="count">{viewRows.length} of {rows.length}</span>
      {/if}
      <span class="count-pill">{selectedIds.length} selected</span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="check-col">
              <input
                type="checkbox"
                checked={visibleAllSelected}
                onchange={toggleSelectAllVisible}
                aria-label="Select all visible"
              />
            </th>
            <th><button type="button" onclick={() => toggleSort('id')}>ID{sortIndicator('id')}</button></th>
            <th class="name-col"><button type="button" onclick={() => toggleSort('name')}>Name{sortIndicator('name')}</button></th>
            <th><button type="button" onclick={() => toggleSort('atkBonus')}>atkBonus{sortIndicator('atkBonus')}</button></th>
            <th><button type="button" onclick={() => toggleSort('pokerus')}>pokerus{sortIndicator('pokerus')}</button></th>
            <th><button type="button" onclick={() => toggleSort('exp')}>exp{sortIndicator('exp')}</button></th>
            <th><button type="button" onclick={() => toggleSort('inEgg')}>in egg{sortIndicator('inEgg')}</button></th>
            <th><button type="button" onclick={() => toggleSort('shiny')}>shiny{sortIndicator('shiny')}</button></th>
          </tr>
        </thead>
        <tbody>
          {#each viewRows as row (row.id)}
            <tr
              class:selected={selected.has(row.id)}
              onclick={() => toggleSelected(row.id)}
              ondblclick={() => openEdit(row.id)}
            >
              <td class="check-col">
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onclick={(e) => e.stopPropagation()}
                  onchange={() => toggleSelected(row.id)}
                  aria-label={`Select ${row.name}`}
                />
              </td>
              <td>{row.id}</td>
              <td class="name-col">{row.name}</td>
              <td>{row.atkBonus}</td>
              <td>{pokerusLabel(row.pokerus)}</td>
              <td>{row.exp}</td>
              <td>{row.inEgg ? 'yes' : ''}</td>
              <td>{row.shiny ? 'yes' : ''}</td>
            </tr>
          {:else}
            <tr><td colspan="8" class="muted">(no caught pokémon)</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="actions">
      <button type="button" onclick={() => onBulkShiny(true)} disabled={selectedIds.length === 0}>
        Shiny on
      </button>
      <button type="button" onclick={() => onBulkShiny(false)} disabled={selectedIds.length === 0}>
        Shiny off
      </button>
      <span class="group">
        <select
          value={String(bulkPokerus)}
          onchange={(e) => (bulkPokerus = Number(e.currentTarget.value))}
          aria-label="Bulk pokérus level"
        >
          {#each POKERUS_LABELS as label, value (value)}
            <option value={String(value)}>{label}</option>
          {/each}
        </select>
        <button
          type="button"
          onclick={onBulkPokerus}
          disabled={selectedIds.length === 0}
          aria-label="Apply pokérus"
        >
          Apply pokérus
        </button>
      </span>
      <button type="button" onclick={onBulkAtkBonus} disabled={selectedIds.length === 0}>
        Set atkBonus {QUICK_ATK_BONUS}
      </button>
      <button type="button" onclick={onEditSelected} disabled={selectedIds.length !== 1}>
        Edit selected…
      </button>
      <button type="button" onclick={clearSelection} disabled={selectedIds.length === 0}>
        Clear selection
      </button>
    </div>
    <p class="note hint">
      Pokérus: in-game, any infected pokémon with {POKERUS_RESISTANT_EVS}+ EVs is
      promoted to Resistant as soon as the save loads (Resistant keeps the
      Contagious attack bonus).
    </p>
    </Card>
  </section>

  <dialog bind:this={dialogEl} aria-labelledby="caught-dialog-title">
    {#if editRow}
      <h3 id="caught-dialog-title">
        Edit #{editRow.id} {editRow.name}
      </h3>

      <NumberField
        label="atkBonus (+25 per hatch)"
        value={draft.atkBonus ?? 0}
        onCommit={(n) => (draft.atkBonus = n)}
        labelWidth="11rem"
      />
      <label class="row select-row">
        <span class="select-label">pokerus</span>
        <select
          value={String(draft.pokerus ?? 0)}
          onchange={(e) => (draft.pokerus = Number((e.target as HTMLSelectElement).value))}
        >
          {#each POKERUS_LABELS as label, value (value)}
            <option value={String(value)}>{value} — {label}</option>
          {/each}
        </select>
      </label>
      <NumberField
        label="exp"
        value={draft.exp ?? 0}
        onCommit={(n) => (draft.exp = n)}
        labelWidth="11rem"
      />

      <label class="row checkbox">
        <input
          type="checkbox"
          checked={draft.inEgg ?? false}
          onchange={(e) => (draft.inEgg = (e.target as HTMLInputElement).checked)}
        />
        <span>in egg / breeding-pending</span>
      </label>
      <label class="row checkbox">
        <input
          type="checkbox"
          checked={draft.shiny ?? false}
          onchange={(e) => (draft.shiny = (e.target as HTMLInputElement).checked)}
        />
        <span>shiny</span>
      </label>

      <div class="dialog-actions">
        <button type="button" onclick={closeEdit}>Cancel</button>
        <button type="button" class="primary" onclick={saveEdit}>OK</button>
      </div>
    {/if}
  </dialog>
{/if}

<style>
  .empty {
    color: var(--text-muted);
    padding: var(--space-4);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
  }
  .block {
    margin-bottom: var(--space-5);
  }
  .note {
    margin: 0 0 var(--space-3);
    color: var(--text-muted);
    font-size: 0.9em;
  }
  .note.hint {
    margin: var(--space-3) 0 0;
    font-size: 0.85em;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
    font-size: 0.85em;
    color: var(--text);
  }
  .filters label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  select {
    font: inherit;
    padding: 0.2rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
  }
  .filters .count {
    color: var(--text-muted);
  }
  .count-pill {
    margin-left: auto;
    color: var(--text-muted);
    padding: 0.1rem var(--space-2);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
  }

  /* Table ------------------------------------------------------ */
  .table-wrap {
    max-height: 28rem;
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
  th button {
    border: none;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    color: var(--text);
    padding: 0;
  }
  th button:hover {
    color: var(--brand);
  }
  .name-col {
    text-align: left;
  }
  .check-col {
    width: 2rem;
  }
  tbody tr {
    cursor: pointer;
    user-select: none;
  }
  tbody tr:hover {
    background: var(--surface-2);
  }
  tbody tr.selected {
    background: var(--selected-bg);
  }
  .muted {
    color: var(--text-muted);
    cursor: default;
  }

  /* Buttons (filters, actions, dialog) ------------------------ */
  .filters .clear,
  .actions button,
  .dialog-actions button {
    padding: 0.35rem 0.8rem;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font: inherit;
    font-size: 0.9em;
  }
  .filters .clear:hover,
  .actions button:hover:not(:disabled),
  .dialog-actions button:hover {
    border-color: var(--text-muted);
  }
  .actions button:disabled {
    color: var(--text-muted);
    opacity: 0.6;
    cursor: not-allowed;
  }
  .actions {
    margin-top: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .actions .group {
    display: inline-flex;
    gap: var(--space-1);
  }

  /* Dialog --------------------------------------------------- */
  dialog {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-5);
    width: min(34rem, 92vw);
    max-height: 85vh;
    overflow-y: auto;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  dialog::backdrop {
    background: var(--backdrop);
  }
  dialog h3 {
    margin: 0 0 var(--space-3);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
  }
  .row.checkbox {
    margin-top: var(--space-1);
  }
  .select-row {
    gap: var(--space-3);
  }
  .select-label {
    width: 11rem;
    flex: none;
  }
  .select-row select {
    flex: 1;
    padding: 0.3rem 0.4rem;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .dialog-actions .primary {
    background: var(--brand);
    color: var(--brand-contrast);
    border-color: var(--brand);
  }
  .dialog-actions .primary:hover {
    filter: brightness(1.1);
  }
</style>
