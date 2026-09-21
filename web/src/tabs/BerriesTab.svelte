<script lang="ts">
  // Berries tab — port of pcedit_gui.BerriesTab. 70-row sortable table with
  // multi-select via per-row checkboxes, selection-aware actions, bulk
  // actions, and a mulch+shovels frame below.

  import { store } from '../lib/store.svelte'
  import { MULCH_NAMES, nameForMulch } from '../lib/data'
  import {
    fillAllBerryCounts,
    readBerryRows,
    readMulch,
    readShovels,
    setAllBerriesUnlocked,
    setBerryCounts,
    setBerryUnlockedMany,
    setMulchCount,
    setShovels,
    type BerryRow,
  } from '../lib/berries'
  import SimpleIntDialog from '../components/SimpleIntDialog.svelte'
  import Card from '../components/ui/Card.svelte'
  import SectionHeader from '../components/ui/SectionHeader.svelte'

  // --- reactive state ----------------------------------------------------

  // Bump after every mutation; $derived watches it to re-read from store.data.
  let tick = $state(0)

  /** Selected row indices (BerryType ids 0..69). */
  let selected = $state(new Set<number>())

  /** Filter: show only currently-unlocked berries. */
  let unlockedOnly = $state(false)

  /** Sort spec for the table. */
  let sortCol = $state<'idx' | 'name' | 'count' | 'unlocked'>('idx')
  let sortReverse = $state(false)

  let rows = $derived.by<BerryRow[]>(() => {
    void tick
    return store.data ? readBerryRows(store.data) : []
  })

  let viewRows = $derived.by<BerryRow[]>(() => {
    const filtered = unlockedOnly ? rows.filter((r) => r.unlocked) : rows.slice()
    filtered.sort((a, b) => {
      let av: number | string
      let bv: number | string
      switch (sortCol) {
        case 'idx': av = a.idx; bv = b.idx; break
        case 'name': av = a.name; bv = b.name; break
        case 'count': av = a.count; bv = b.count; break
        case 'unlocked': av = a.unlocked ? 1 : 0; bv = b.unlocked ? 1 : 0; break
      }
      if (av < bv) return sortReverse ? 1 : -1
      if (av > bv) return sortReverse ? -1 : 1
      return 0
    })
    return filtered
  })

  let mulch = $derived.by<number[]>(() => {
    void tick
    return store.data ? readMulch(store.data) : []
  })

  let shovels = $derived.by(() => {
    void tick
    return store.data ? readShovels(store.data) : { shovel: 0, mulchShovel: 0 }
  })

  // Local in-flight text state for mulch + shovels so commit-on-blur works.
  let mulchText = $state<Record<number, string>>({})
  let shovelText = $state('0')
  let mulchShovelText = $state('0')

  $effect(() => {
    void tick
    mulchText = Object.fromEntries(mulch.map((v, i) => [i, String(v)]))
    shovelText = String(shovels.shovel)
    mulchShovelText = String(shovels.mulchShovel)
  })

  // --- mutation plumbing -------------------------------------------------

  let editDialog = $state<{ open: (t: string, p: string, d?: number) => Promise<number | null> }>()

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

  // --- sort --------------------------------------------------------------

  function toggleSort(col: typeof sortCol): void {
    if (sortCol === col) sortReverse = !sortReverse
    else {
      sortCol = col
      sortReverse = false
    }
  }

  function sortIndicator(col: typeof sortCol): string {
    if (sortCol !== col) return ''
    return sortReverse ? ' ↓' : ' ↑'
  }

  // --- selection ---------------------------------------------------------

  function toggleSelected(idx: number): void {
    if (selected.has(idx)) selected.delete(idx)
    else selected.add(idx)
    selected = new Set(selected) // force reactivity
  }

  function selectAllVisible(): void {
    for (const r of viewRows) selected.add(r.idx)
    selected = new Set(selected)
  }

  function clearSelection(): void {
    selected = new Set()
  }

  let visibleAllSelected = $derived(
    viewRows.length > 0 && viewRows.every((r) => selected.has(r.idx)),
  )

  function toggleSelectAllVisible(): void {
    if (visibleAllSelected) {
      for (const r of viewRows) selected.delete(r.idx)
      selected = new Set(selected)
    } else {
      selectAllVisible()
    }
  }

  // --- actions -----------------------------------------------------------

  async function onEditCount(): Promise<void> {
    if (selected.size === 0 || !editDialog) return
    const noun = selected.size === 1 ? 'berry' : 'berries'
    const n = await editDialog.open(
      'Set count',
      `Set count for ${selected.size} selected ${noun}:`,
      0,
    )
    if (n === null) return
    const indices = [...selected]
    refreshAfter(() => setBerryCounts(store.data!, indices, n))
  }

  function onUnlockSelected(on: boolean): void {
    if (selected.size === 0) return
    const indices = [...selected]
    refreshAfter(() => setBerryUnlockedMany(store.data!, indices, on))
  }

  function onSetAllUnlocked(on: boolean): void {
    refreshAfter(() => setAllBerriesUnlocked(store.data!, on))
  }

  function onFillAll(n: number): void {
    refreshAfter(() => fillAllBerryCounts(store.data!, n))
  }

  function parseInt0(raw: string): number | null {
    const cleaned = raw.replace(/,/g, '').trim()
    if (cleaned === '') return 0
    const n = Number.parseInt(cleaned, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  function commitMulch(idx: number): void {
    const n = parseInt0(mulchText[idx] ?? '')
    if (n === null) {
      mulchText[idx] = String(mulch[idx] ?? 0)
      return
    }
    if (n === mulch[idx]) return
    refreshAfter(() => setMulchCount(store.data!, idx, n))
  }

  function commitShovels(): void {
    const s = parseInt0(shovelText)
    const m = parseInt0(mulchShovelText)
    if (s === null || m === null) {
      shovelText = String(shovels.shovel)
      mulchShovelText = String(shovels.mulchShovel)
      return
    }
    if (s === shovels.shovel && m === shovels.mulchShovel) return
    refreshAfter(() => setShovels(store.data!, s, m))
  }

  function onCellKey(evt: KeyboardEvent): void {
    if (evt.key === 'Enter' || evt.key === 'Escape') {
      ;(evt.target as HTMLInputElement).blur()
    }
  }
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to edit berries.</p>
{:else}
  <section class="block">
    <Card>
      <SectionHeader
        title="Berries"
        description="Per-berry inventory counts and unlocked flags (save.farming.berryList / unlockedBerries)."
      />
      <div class="header">
        <label class="filter">
          <input type="checkbox" bind:checked={unlockedOnly} />
          <span>Show unlocked only</span>
        </label>
        <span class="count-pill">{selected.size} selected</span>
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
              <th>
                <button type="button" onclick={() => toggleSort('idx')}>
                  #{sortIndicator('idx')}
                </button>
              </th>
              <th class="name-col">
                <button type="button" onclick={() => toggleSort('name')}>
                  Berry{sortIndicator('name')}
                </button>
              </th>
              <th>
                <button type="button" onclick={() => toggleSort('count')}>
                  Count{sortIndicator('count')}
                </button>
              </th>
              <th>
                <button type="button" onclick={() => toggleSort('unlocked')}>
                  Unlocked{sortIndicator('unlocked')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each viewRows as row (row.idx)}
              <tr
                class:selected={selected.has(row.idx)}
                class:locked={!row.unlocked}
              >
                <td class="check-col">
                  <input
                    type="checkbox"
                    checked={selected.has(row.idx)}
                    onchange={() => toggleSelected(row.idx)}
                    aria-label={`Select ${row.name}`}
                  />
                </td>
                <td>{row.idx}</td>
                <td class="name-col">{row.name}</td>
                <td>{row.count}</td>
                <td>{row.unlocked ? '✓' : ''}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="muted">(no berries match the filter)</td></tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="actions">
        <button type="button" onclick={onEditCount} disabled={selected.size === 0}>
          Edit count…
        </button>
        <button type="button" onclick={() => onUnlockSelected(true)} disabled={selected.size === 0}>
          Unlock selected
        </button>
        <button type="button" onclick={() => onUnlockSelected(false)} disabled={selected.size === 0}>
          Lock selected
        </button>
        <button type="button" onclick={clearSelection} disabled={selected.size === 0}>
          Clear selection
        </button>
      </div>

      <div class="actions bulk">
        <button type="button" onclick={() => onSetAllUnlocked(true)}>Unlock all</button>
        <button type="button" onclick={() => onSetAllUnlocked(false)}>Lock all</button>
        <button type="button" onclick={() => onFillAll(0)}>Zero counts</button>
        <button type="button" onclick={() => onFillAll(999)}>All counts to 999</button>
        <button type="button" onclick={() => onFillAll(9999)}>All counts to 9999</button>
      </div>
    </Card>
  </section>

  <section class="block">
    <Card>
      <SectionHeader title="Mulch & shovels" />
      <p class="note">
        <code>save.farming.mulchList</code> — first {MULCH_NAMES.length} cells
        use the canonical <code>MulchType</code> names; later slots fall back
        to <code>Slot N</code>.
      </p>
      <div class="mulch-grid">
        {#each mulch as _v, idx (idx)}
          <label class="mulch-cell">
            <span class="mulch-name">{nameForMulch(idx)}</span>
            <input
              type="text"
              inputmode="numeric"
              bind:value={mulchText[idx]}
              onblur={() => commitMulch(idx)}
              onkeydown={onCellKey}
            />
          </label>
        {/each}
      </div>

      <div class="shovels">
        <label>
          <span>Regular shovels</span>
          <input
            type="text"
            inputmode="numeric"
            bind:value={shovelText}
            onblur={commitShovels}
            onkeydown={onCellKey}
          />
        </label>
        <label>
          <span>Mulch shovels</span>
          <input
            type="text"
            inputmode="numeric"
            bind:value={mulchShovelText}
            onblur={commitShovels}
            onkeydown={onCellKey}
          />
        </label>
      </div>
    </Card>
  </section>
{/if}

<SimpleIntDialog bind:ref={editDialog} />

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
  .note code {
    background: var(--surface-2);
    color: var(--text);
    padding: 0 var(--space-1);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.95em;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
  }
  .filter {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.9em;
    color: var(--text);
  }
  .count-pill {
    font-size: 0.85em;
    color: var(--text-muted);
    padding: 0.1rem var(--space-2);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
  }

  /* Table ----------------------------------------------- */
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
  tr.selected {
    background: var(--selected-bg);
  }
  tr.locked td {
    color: var(--text-muted);
  }
  .muted {
    color: var(--text-muted);
  }

  /* Action rows --------------------------------------- */
  .actions {
    margin-top: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .actions.bulk {
    border-top: 1px dashed var(--border);
    padding-top: var(--space-3);
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
  .actions button:hover:not(:disabled) {
    border-color: var(--text-muted);
  }
  .actions button:disabled {
    color: var(--text-muted);
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Mulch / shovels ---------------------------------- */
  .mulch-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
    gap: var(--space-2) var(--space-3);
  }
  .mulch-cell,
  .shovels label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .mulch-name,
  .shovels label span {
    color: var(--text-muted);
    font-size: 0.85em;
  }
  .mulch-cell input,
  .shovels input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    text-align: right;
  }
  .mulch-cell input:focus,
  .shovels input:focus {
    outline: 2px solid var(--focus-ring);
    outline-offset: -1px;
  }
  .shovels {
    margin-top: var(--space-4);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2) var(--space-3);
    max-width: 24rem;
  }
</style>
