<script lang="ts">
  // Eggs tab — port of pcedit_gui.EggsTab. Reads save.breeding.{eggSlots,
  // eggList}. Per-row actions (Edit / Hatch / Empty), bulk actions (Add
  // egg, Quick-add presets), eggSlots editable above. The game has
  // MAX_EGG_SLOTS slots: adds are refused once they're full, and emptying
  // an egg never shifts the others (hatchery helpers are per slot). Edit
  // uses a native <dialog> for the form — accessible, no third-party deps.
  //
  // The store's data is read directly, with `tick` as a refresh signal
  // bumped after every mutation (Svelte 5 doesn't track array splices
  // through $derived without a hint).

  import { store } from '../lib/store.svelte'
  import {
    addEgg,
    clearEgg,
    EGG_TYPE,
    eggPokemonError,
    eggTypeLabel,
    EMPTY_EGG,
    hatchEgg,
    MAX_EGG_SLOTS,
    quickAddEgg,
    SHINY_CHANCE_BREEDING,
    QUICK_ADD_PRESETS,
    readEggs,
    readEggSlots,
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

  const SLOTS_FULL_STATUS = `All ${MAX_EGG_SLOTS} egg slots are full: empty one first`

  /** Run an add that returns the slot it used (or null when full) and
   *  report the outcome. A refused add leaves the save clean. */
  function addWith(add: () => number | null, what: string): void {
    if (!store.data) return
    let idx: number | null
    try {
      idx = add()
    } catch (e) {
      store.errorDetail = e instanceof Error ? e.message : String(e)
      store.status = 'invalid value rejected'
      return
    }
    if (idx === null) {
      store.status = SLOTS_FULL_STATUS
      return
    }
    store.markDirty()
    tick++
    store.status = `added ${what} in slot ${idx + 1}`
  }

  function onAdd(): void {
    addWith(() => addEgg(store.data!), 'egg')
  }

  function onQuickAdd(preset: QuickAddPreset): void {
    addWith(() => quickAddEgg(store.data!, preset), preset.label)
  }

  // --- edit dialog -------------------------------------------------------

  let dialogEl: HTMLDialogElement | undefined = $state()
  let editIndex: number | null = $state(null)
  let draft: Egg = $state({ ...EMPTY_EGG })
  let editError: string | null = $state(null)

  /** The real egg types, plus the draft's own value when it's a legacy one
   *  (2–8 from older editor versions) so opening the dialog doesn't
   *  silently change it. */
  let typeOptions = $derived.by<number[]>(() => {
    const real = Object.values(EGG_TYPE) as number[]
    return real.includes(draft.type) ? real : [...real, draft.type]
  })

  function openEdit(i: number): void {
    editIndex = i
    editError = null
    // Shallow copy so the dialog form doesn't mutate the live save until OK.
    draft = { ...eggs[i] }
    dialogEl?.showModal()
  }

  function closeEdit(): void {
    dialogEl?.close()
    editIndex = null
    editError = null
  }

  function saveEdit(): void {
    if (editIndex === null) {
      closeEdit()
      return
    }
    // Unknown ids hatch MissingNo in the game: keep the dialog open.
    editError = eggPokemonError(draft)
    if (editError !== null) {
      store.status = 'invalid value rejected'
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
      suffix={`(save.breeding.eggSlots, max ${MAX_EGG_SLOTS})`}
    />
  </section>

  <section class="block">
    <table>
      <thead>
        <tr>
          <th>Slot</th>
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
          <tr class:empty={egg.type === EGG_TYPE.None}>
            <td>
              {i + 1} of {MAX_EGG_SLOTS}
              {#if i >= MAX_EGG_SLOTS}<span class="muted">(dropped by the game)</span>{/if}
            </td>
            <td>{egg.pokemon}</td>
            <td>{egg.type} <span class="muted">({eggTypeLabel(egg.type)})</span></td>
            <td>{egg.steps}</td>
            <td>{egg.totalSteps}</td>
            <td>{egg.shinyChance}</td>
            <td>{egg.notified ? 'yes' : ''}</td>
            <td class="actions-cell">
              <button type="button" onclick={() => openEdit(i)}>Edit</button>
              <button type="button" onclick={() => onHatch(i)} disabled={egg.type === EGG_TYPE.None}>Hatch</button>
              <button type="button" onclick={() => onClear(i)}>Empty</button>
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
    <h3>Quick-add egg</h3>
    <p class="note">
      Adds an item egg of that species (like a shop egg) to the first empty
      slot, raising egg slots to match. The game has {MAX_EGG_SLOTS} slots;
      when all are full, empty one first.
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
    <h3 id="egg-dialog-title">Edit egg {editIndex !== null ? `in slot ${editIndex + 1}` : ''}</h3>

    <NumberField
      label="Pokémon ID"
      value={draft.pokemon}
      integer={false}
      onCommit={(n) => (draft.pokemon = n)}
      labelWidth="10rem"
    />
    <label class="row">
      <span class="label">Type</span>
      <select
        value={String(draft.type)}
        onchange={(e) => (draft.type = Number((e.target as HTMLSelectElement).value))}
      >
        {#each typeOptions as val (val)}
          <option value={String(val)}>{val} ({eggTypeLabel(val)})</option>
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
      suffix={`(lower = more likely; game default ${SHINY_CHANCE_BREEDING})`}
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

    {#if editError}<p class="error" role="alert">{editError}</p>{/if}

    <div class="dialog-actions">
      <button type="button" onclick={closeEdit}>Cancel</button>
      <button type="button" class="primary" onclick={saveEdit}>OK</button>
    </div>
  </dialog>
{/if}

<style>
  .empty {
    color: var(--text-muted);
    padding: 1rem;
    background: var(--surface-2);
    border-radius: 6px;
  }
  .block {
    margin-bottom: 1.25rem;
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
  }
  .block h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .note {
    margin: 0 0 0.5rem;
    color: var(--text-muted);
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
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--text-muted);
    font-weight: 500;
  }
  tr.empty td {
    color: var(--text-muted);
  }
  .muted {
    color: var(--text-muted);
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
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    font-size: 0.85em;
  }
  button:hover:not(:disabled) {
    border-color: var(--text-muted);
  }
  button:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }

  /* Dialog --------------------------------------------------------- */
  /* Explicit width so the form doesn't squish on small viewports;
     max-height + overflow keep all fields reachable when the viewport
     is shorter than the content. */
  dialog {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem;
    width: min(38rem, 92vw);
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
    color: var(--text-muted);
  }
  .row.checkbox {
    margin-top: 0.25rem;
  }
  select {
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
  }
  .error {
    color: var(--danger);
    margin: var(--space-3) 0 0;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
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
