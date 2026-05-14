<script lang="ts">
  // Eggs tab — port of pcedit_gui.EggsTab. Reads save.breeding.{eggSlots,
  // eggList}. Per-row actions (Hatch / Empty / Remove / Edit), bulk
  // actions (Add egg, Quick-add presets), eggSlots editable above. Edit
  // uses a native <dialog> for the form — accessible, no third-party deps.
  //
  // The store's data is read directly, with `tick` as a refresh signal
  // bumped after every mutation (Svelte 5 doesn't track array splices
  // through $derived without a hint).

  import { store } from '../lib/store.svelte'
  import {
    addEgg,
    clearEgg,
    EGG_TYPE_LABELS,
    eggTypeLabel,
    hatchEgg,
    quickAddEgg,
    QUICK_ADD_PRESETS,
    readEggs,
    readEggSlots,
    removeEgg,
    setEgg,
    writeEggSlots,
    type Egg,
    type QuickAddPreset,
  } from '../lib/breeding'
  import NumberField from '../components/NumberField.svelte'

  // Bump after every mutation to nudge $derived re-computation. Svelte 5
  // can't see mutations *inside* the SaveData object on its own.
  let tick = $state(0)

  let eggs = $derived.by<Egg[]>(() => {
    void tick
    return store.data ? readEggs(store.data) : []
  })

  let slots = $derived.by<number>(() => {
    void tick
    return store.data ? readEggSlots(store.data) : 0
  })

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

  function onSlotsChange(n: number): void {
    refreshAfter(() => writeEggSlots(store.data!, n))
  }

  function onHatch(i: number): void {
    refreshAfter(() => hatchEgg(store.data!, i))
  }

  function onClear(i: number): void {
    refreshAfter(() => clearEgg(store.data!, i))
  }

  function onRemove(i: number): void {
    refreshAfter(() => removeEgg(store.data!, i))
  }

  function onAdd(): void {
    refreshAfter(() => addEgg(store.data!))
  }

  function onQuickAdd(preset: QuickAddPreset): void {
    refreshAfter(() => {
      const idx = quickAddEgg(store.data!, preset)
      store.status = `added ${eggTypeLabel(preset.template.type)} egg in slot ${idx}`
    })
  }

  // --- edit dialog -------------------------------------------------------

  let dialogEl: HTMLDialogElement | undefined = $state()
  let editIndex: number | null = $state(null)
  let draft: Egg = $state(blankEgg())

  function blankEgg(): Egg {
    return { type: -1, pokemon: 0, steps: 0, totalSteps: 0, shinyChance: 1024, notified: false }
  }

  function openEdit(i: number): void {
    editIndex = i
    // Shallow copy so the dialog form doesn't mutate the live save until OK.
    draft = { ...eggs[i] }
    dialogEl?.showModal()
  }

  function closeEdit(): void {
    dialogEl?.close()
    editIndex = null
  }

  function saveEdit(): void {
    if (editIndex === null) {
      closeEdit()
      return
    }
    const i = editIndex
    refreshAfter(() => setEgg(store.data!, i, { ...draft }))
    closeEdit()
  }
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to edit the egg list.</p>
{:else}
  <section class="block">
    <NumberField
      label="Egg slots"
      value={slots}
      onCommit={onSlotsChange}
      suffix="(save.breeding.eggSlots)"
    />
  </section>

  <section class="block">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Pokémon</th>
          <th>Type</th>
          <th>Steps</th>
          <th>Total</th>
          <th>Shiny ch.</th>
          <th>Notif</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each eggs as egg, i (i)}
          <tr class:empty={egg.type === -1}>
            <td>{i}</td>
            <td>{egg.pokemon}</td>
            <td>{egg.type} <span class="muted">({eggTypeLabel(egg.type)})</span></td>
            <td>{egg.steps}</td>
            <td>{egg.totalSteps}</td>
            <td>{egg.shinyChance}</td>
            <td>{egg.notified ? 'yes' : ''}</td>
            <td class="actions-cell">
              <button type="button" onclick={() => openEdit(i)}>Edit</button>
              <button type="button" onclick={() => onHatch(i)} disabled={egg.type === -1}>Hatch</button>
              <button type="button" onclick={() => onClear(i)}>Empty</button>
              <button type="button" onclick={() => onRemove(i)}>Remove</button>
            </td>
          </tr>
        {:else}
          <tr><td colspan="8" class="muted">(no eggs)</td></tr>
        {/each}
      </tbody>
    </table>

    <div class="actions">
      <button type="button" onclick={onAdd}>+ Add egg (default)</button>
    </div>
  </section>

  <section class="block">
    <h3>Quick-add type egg</h3>
    <p class="note">
      Fills the first empty slot, or appends if all are full (bumps egg slots
      to match).
    </p>
    <div class="actions">
      {#each QUICK_ADD_PRESETS as preset (preset.label)}
        <button type="button" onclick={() => onQuickAdd(preset)}>
          + {preset.label}
        </button>
      {/each}
    </div>
  </section>

  <!-- Edit modal. Native <dialog> handles focus trap + Escape-to-close.
       Width is explicit so the form doesn't squish; max-height + overflow
       keep it usable on shorter viewports without clipping. NumberFields
       use a compact 10rem label column so the input column gets enough
       room inside the dialog. -->
  <dialog bind:this={dialogEl} aria-labelledby="egg-dialog-title">
    <h3 id="egg-dialog-title">Edit egg {editIndex !== null ? `#${editIndex}` : ''}</h3>

    <NumberField
      label="Pokémon ID"
      value={draft.pokemon}
      onCommit={(n) => (draft.pokemon = n)}
      labelWidth="10rem"
    />
    <label class="row">
      <span class="label">Type</span>
      <select
        value={String(draft.type)}
        onchange={(e) => (draft.type = Number((e.target as HTMLSelectElement).value))}
      >
        {#each Object.entries(EGG_TYPE_LABELS) as [val, name] (val)}
          <option value={val}>{val} ({name})</option>
        {/each}
      </select>
    </label>
    <NumberField
      label="Current steps"
      value={draft.steps}
      onCommit={(n) => (draft.steps = n)}
      labelWidth="10rem"
    />
    <NumberField
      label="Total steps to hatch"
      value={draft.totalSteps}
      onCommit={(n) => (draft.totalSteps = n)}
      labelWidth="10rem"
    />
    <NumberField
      label="Shiny chance"
      value={draft.shinyChance}
      onCommit={(n) => (draft.shinyChance = n)}
      suffix="(lower = more likely)"
      labelWidth="10rem"
    />
    <label class="row checkbox">
      <input
        type="checkbox"
        checked={draft.notified}
        onchange={(e) => (draft.notified = (e.target as HTMLInputElement).checked)}
      />
      <span>notified</span>
    </label>

    <div class="dialog-actions">
      <button type="button" onclick={closeEdit}>Cancel</button>
      <button type="button" class="primary" onclick={saveEdit}>OK</button>
    </div>
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
  .block h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .note {
    margin: 0 0 0.5rem;
    color: #666;
    font-size: 0.9em;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  th,
  td {
    text-align: left;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid #eee;
  }
  th {
    color: #666;
    font-weight: 500;
  }
  tr.empty td {
    color: #999;
  }
  .muted {
    color: #999;
  }
  .actions-cell {
    text-align: right;
    white-space: nowrap;
  }
  .actions-cell button {
    margin-left: 0.25rem;
  }
  .actions {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  button {
    padding: 0.3rem 0.7rem;
    border: 1px solid #ccc;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    font-size: 0.85em;
  }
  button:hover:not(:disabled) {
    background: #f0f0f0;
  }
  button:disabled {
    color: #aaa;
    cursor: not-allowed;
  }

  /* Dialog --------------------------------------------------------- */
  /* Explicit width so the form doesn't squish on small viewports;
     max-height + overflow keep all fields reachable when the viewport
     is shorter than the content. */
  dialog {
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 1.25rem;
    width: min(38rem, 92vw);
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
  .row .label {
    flex: 0 0 10rem;
    color: #444;
  }
  .row.checkbox {
    margin-top: 0.25rem;
  }
  select {
    padding: 0.25rem 0.4rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font: inherit;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
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
