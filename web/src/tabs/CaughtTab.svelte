<script lang="ts">
  // Caught Pokémon tab — port of pcedit_gui.CaughtTab + CaughtDialog.
  //
  // Click a row to select it. Action bar applies to the selected row only
  // (mirrors the desktop's single-select Treeview). Click again to deselect.
  // Sortable column headers; numeric columns sort numerically.

  import { store } from '../lib/store.svelte'
  import {
    readCaughtRows,
    setCaughtAtkBonus,
    setCaughtEntry,
    setCaughtShiny,
    type CaughtPatch,
    type CaughtRow,
  } from '../lib/caught'
  import NumberField from '../components/NumberField.svelte'

  // PokeClicker Pokerus enum (key "8"): 0 Uninfected … 3 Resistant.
  const POKERUS_LABELS = ['Uninfected', 'Infected', 'Contagious', 'Resistant'] as const
  const pokerusLabel = (n: number): string => POKERUS_LABELS[n] ?? String(n)

  // --- reactive state ----------------------------------------------------

  let tick = $state(0)
  let selectedId = $state<number | null>(null)

  type SortCol = 'id' | 'name' | 'atkBonus' | 'pokerus' | 'exp' | 'inEgg' | 'shiny'
  let sortCol = $state<SortCol>('id')
  let sortReverse = $state(false)

  const NUMERIC_COLS: ReadonlySet<SortCol> = new Set(['id', 'atkBonus', 'pokerus', 'exp'])
  const BOOL_COLS: ReadonlySet<SortCol> = new Set(['inEgg', 'shiny'])

  let rows = $derived.by<CaughtRow[]>(() => {
    void tick
    return store.data ? readCaughtRows(store.data) : []
  })

  let viewRows = $derived.by<CaughtRow[]>(() => {
    const out = rows.slice()
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

  let selectedRow = $derived(
    selectedId !== null ? rows.find((r) => r.id === selectedId) ?? null : null,
  )

  // --- mutation plumbing -------------------------------------------------

  function refreshAfter(fn: () => void): void {
    if (!store.data) return
    try {
      fn()
      store.markDirty()
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

  function selectRow(id: number): void {
    selectedId = selectedId === id ? null : id
  }

  // --- quick actions -----------------------------------------------------

  function onMarkShiny(): void {
    if (selectedId === null) return
    const id = selectedId
    refreshAfter(() => setCaughtShiny(store.data!, [id], true))
  }
  function onClearShiny(): void {
    if (selectedId === null) return
    const id = selectedId
    refreshAfter(() => setCaughtShiny(store.data!, [id], false))
  }
  function onAtkBonus100(): void {
    if (selectedId === null) return
    const id = selectedId
    refreshAfter(() => setCaughtAtkBonus(store.data!, [id], 100))
  }

  // --- edit dialog --------------------------------------------------------

  let dialogEl: HTMLDialogElement | undefined = $state()
  let draft: CaughtPatch = $state({})

  function openEdit(): void {
    if (!selectedRow) return
    draft = {
      atkBonus: selectedRow.atkBonus,
      pokerus: selectedRow.pokerus,
      exp: selectedRow.exp,
      inEgg: selectedRow.inEgg,
      shiny: selectedRow.shiny,
    }
    dialogEl?.showModal()
  }

  function closeEdit(): void {
    dialogEl?.close()
  }

  function saveEdit(): void {
    if (selectedId === null) {
      closeEdit()
      return
    }
    const id = selectedId
    const patch = { ...draft }
    refreshAfter(() => setCaughtEntry(store.data!, id, patch))
    closeEdit()
  }

  function onRowDoubleClick(id: number): void {
    selectedId = id
    queueMicrotask(openEdit)
  }
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to edit caught pokémon.</p>
{:else}
  <section class="block">
    <p class="note">
      Click a row to select. Double-click to edit. atkBonus increments by 25 per hatch.
    </p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
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
              class:selected={selectedId === row.id}
              onclick={() => selectRow(row.id)}
              ondblclick={() => onRowDoubleClick(row.id)}
            >
              <td>{row.id}</td>
              <td class="name-col">{row.name}</td>
              <td>{row.atkBonus}</td>
              <td>{pokerusLabel(row.pokerus)}</td>
              <td>{row.exp}</td>
              <td>{row.inEgg ? 'yes' : ''}</td>
              <td>{row.shiny ? 'yes' : ''}</td>
            </tr>
          {:else}
            <tr><td colspan="7" class="muted">(no caught pokémon)</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="actions">
      <button type="button" onclick={openEdit} disabled={selectedRow === null}>
        Edit selected…
      </button>
      <button type="button" onclick={onMarkShiny} disabled={selectedRow === null}>
        Mark shiny
      </button>
      <button type="button" onclick={onClearShiny} disabled={selectedRow === null}>
        Clear shiny
      </button>
      <button type="button" onclick={onAtkBonus100} disabled={selectedRow === null}>
        Set atkBonus 100
      </button>
    </div>
  </section>

  <dialog bind:this={dialogEl} aria-labelledby="caught-dialog-title">
    {#if selectedRow}
      <h3 id="caught-dialog-title">
        Edit #{selectedRow.id} {selectedRow.name}
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

  /* Table ------------------------------------------------------ */
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
  th button {
    border: none;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    color: #444;
    padding: 0;
  }
  th button:hover {
    color: #2563eb;
  }
  .name-col {
    text-align: left;
  }
  tbody tr {
    cursor: pointer;
    user-select: none;
  }
  tbody tr:hover {
    background: #f8fafc;
  }
  tbody tr.selected {
    background: #eff6ff;
  }
  .muted {
    color: #999;
    cursor: default;
  }

  /* Action row ----------------------------------------------- */
  .actions {
    margin-top: 0.75rem;
    display: flex;
    flex-wrap: wrap;
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

  /* Dialog --------------------------------------------------- */
  dialog {
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 1.25rem;
    width: min(34rem, 92vw);
    max-height: 85vh;
    overflow-y: auto;
    background: white;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.4);
  }
  dialog h3 {
    margin: 0 0 0.75rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }
  .row.checkbox {
    margin-top: 0.25rem;
  }
  .select-row {
    gap: 0.75rem;
  }
  .select-label {
    width: 11rem;
    flex: none;
  }
  .select-row select {
    flex: 1;
    padding: 0.3rem 0.4rem;
    font: inherit;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .dialog-actions button {
    padding: 0.4rem 0.9rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font: inherit;
  }
  .dialog-actions .primary {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }
  .dialog-actions .primary:hover {
    background: #1d4ed8;
  }
</style>
