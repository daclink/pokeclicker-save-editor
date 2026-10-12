<script lang="ts">
  // Flutes tab — port of the Shards/Gems pattern, but flutes are
  // boolean owned/not-owned in the game (`FluteItem` declares
  // `{ maxAmount: 1 }`), so the UI uses checkboxes and writes 1 on
  // check / deletes the key on uncheck.
  //
  // A running flute lives in `player.effectList`, not `_itemList` — it
  // reads as checked with an "Active" badge. The lib's write rules keep
  // it from being duplicated and turn it off when unchecked; a warning
  // offers to drop the extra copy if a save already holds two.
  //
  // Each active flute consumes one gem/sec from the gemWallet — same
  // wallet the Gems tab edits, so this tab pairs naturally with it.
  // Forward-compat: any `*_Flute` key in `_itemList` that isn't one
  // of the 6 canonical flutes shows up in an extras panel with a
  // numeric input, so the six commented-out flutes (Poke, Azure,
  // Eon, Sun, Moon, Grass) round-trip cleanly if PokeClicker ever
  // enables them.

  import { store } from '../lib/store.svelte'
  import {
    FLUTE_STATE,
    KNOWN_FLUTES,
    readExtraFlutes,
    readFluteStatus,
    repairDuplicateFlutes,
    writeExtraFlutes,
    writeKnownFlutes,
  } from '../lib/flutes'

  let tick = $state(0)

  let status = $derived.by(() => {
    void tick
    return store.data ? readFluteStatus(store.data) : { states: {}, duplicates: [] }
  })

  const isOwned = (name: string): boolean =>
    (status.states[name] ?? FLUTE_STATE.NotOwned) !== FLUTE_STATE.NotOwned
  const isActive = (name: string): boolean => status.states[name] === FLUTE_STATE.Active

  /** "Yellow Flute is" / "Yellow Flute and Red Flute are". */
  let duplicateText = $derived.by(() => {
    const names = status.duplicates.map((n) => `${n} Flute`)
    return `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'}`
  })

  let extras = $derived.by(() => {
    void tick
    return store.data ? readExtraFlutes(store.data) : {}
  })

  let extraText = $state<Record<string, string>>({})

  $effect(() => {
    void tick
    extraText = Object.fromEntries(
      Object.entries(extras).map(([k, v]) => [k, String(v)]),
    )
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

  function toggleKnown(name: string, checked: boolean): void {
    refreshAfter(() => writeKnownFlutes(store.data!, { [name]: checked }))
  }

  function repairDuplicates(): void {
    refreshAfter(() => repairDuplicateFlutes(store.data!))
  }

  function fillAll(owned: boolean): void {
    refreshAfter(() => {
      const edits: Record<string, boolean> = {}
      for (const n of KNOWN_FLUTES) edits[n] = owned
      writeKnownFlutes(store.data!, edits)
    })
  }

  function parseCount(raw: string): number | null {
    const cleaned = raw.replace(/,/g, '').trim()
    if (cleaned === '') return 0
    const n = Number.parseInt(cleaned, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  function commitExtra(key: string): void {
    const n = parseCount(extraText[key] ?? '')
    if (n === null) {
      extraText[key] = String(extras[key] ?? 0)
      return
    }
    if (n === (extras[key] ?? 0)) return
    refreshAfter(() => writeExtraFlutes(store.data!, { [key]: n }))
  }

  function onCellKey(evt: KeyboardEvent): void {
    if (evt.key === 'Enter' || evt.key === 'Escape') {
      (evt.target as HTMLInputElement).blur()
    }
  }
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to edit flute ownership.</p>
{:else}
  <section class="block">
    <p class="note">
      Flute ownership (<code>player._itemList.&lt;Name&gt;_Flute</code>).
      Each flute is owned-or-not — PokeClicker caps it at one. Active
      flutes consume one gem/sec from the gem wallet, so pairing with
      the <strong>Gems</strong> tab is common.
    </p>
    <p class="note">Active flutes are in use; removing one also turns it off.</p>
    {#if status.duplicates.length > 0}
      <div class="dup-warning" role="alert">
        <p>
          {duplicateText} active and also in your items. When it stops, the
          game hands it back, so you'd end up with two.
        </p>
        <button type="button" onclick={repairDuplicates}>Remove extra copies</button>
      </div>
    {/if}
    <ul class="grid">
      {#each KNOWN_FLUTES as name (name)}
        <li class="cell">
          <label>
            <input
              type="checkbox"
              checked={isOwned(name)}
              onchange={(e) => toggleKnown(name, (e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="flute-name">{name} Flute</span>
            {#if isActive(name)}
              <span class="badge-active">Active</span>
            {/if}
          </label>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button type="button" onclick={() => fillAll(true)}>Give all</button>
      <button type="button" onclick={() => fillAll(false)}>Drop all</button>
    </div>
  </section>

  {#if Object.keys(extras).length > 0}
    <section class="block">
      <h3>Other flute items in this save</h3>
      <p class="note">
        Any <code>*_Flute</code> entries the editor doesn't predeclare.
        Future PokeClicker flutes (Poke / Azure / Eon / Sun / Moon /
        Grass) would land here. Numeric input in case the
        <code>maxAmount: 1</code> cap is ever loosened.
      </p>
      <div class="extras">
        {#each Object.keys(extras) as key (key)}
          <label class="extra-row">
            <span class="extra-key">{key}</span>
            <input
              type="text"
              inputmode="numeric"
              bind:value={extraText[key]}
              onblur={() => commitExtra(key)}
              onkeydown={(e) => onCellKey(e)}
            />
          </label>
        {/each}
      </div>
    </section>
  {/if}
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
    margin: 0 0 0.75rem;
    color: var(--text-muted);
    font-size: 0.9em;
  }
  .note code {
    background: var(--surface-2);
    padding: 0 0.25rem;
    border-radius: 3px;
    font-size: 0.95em;
  }

  /* 2-col on wide, 1-col on narrow. With 6 entries that's 3 rows wide
     or 6 stacked — comfortable either way without feeling sparse. */
  .grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem 0.75rem;
  }
  @media (max-width: 420px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  .cell label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    cursor: pointer;
  }
  .cell input[type='checkbox'] {
    width: 1.1rem;
    height: 1.1rem;
    cursor: pointer;
  }
  .flute-name {
    color: var(--text);
  }

  .badge-active {
    padding: 0 var(--space-2);
    border: 1px solid var(--success);
    border-radius: var(--radius-sm);
    color: var(--success);
    font-size: 0.8em;
  }

  .dup-warning {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    margin: 0 0 var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--danger);
    border-radius: var(--radius-sm);
    color: var(--danger);
    font-size: 0.9em;
  }
  .dup-warning p {
    margin: 0;
    flex: 1 1 16rem;
  }

  .actions {
    margin-top: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .dup-warning button,
  .actions button {
    padding: 0.35rem 0.8rem;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    font-size: 0.9em;
  }
  .dup-warning button:hover,
  .actions button:hover {
    border-color: var(--text-muted);
  }

  .extras {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.5rem 0.75rem;
  }
  .extra-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .extra-key {
    color: var(--text-muted);
    font-size: 0.85em;
    font-family: ui-monospace, monospace;
  }
  .extra-row input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    border-radius: 4px;
    font: inherit;
    text-align: right;
  }
  .extra-row input:focus {
    outline: 2px solid var(--focus-ring);
    outline-offset: -1px;
  }
</style>
