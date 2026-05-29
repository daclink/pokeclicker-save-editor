<script lang="ts">
  // Gems tab — port of the Shards tab pattern, but the underlying data
  // is `save.gems.gemWallet` (a positional 18-element int array indexed
  // by PokemonType), not a keyed `_itemList` dict. Consequence: zero is
  // a real stored value here — we don't delete-at-0 like shards do.
  //
  // The schema test allows wallets longer than 18 (forward-compat with
  // PokeClicker adding e.g. a Stellar type), so any trailing positions
  // surface in an "Other" panel as "Type #N".

  import { store } from '../lib/store.svelte'
  import {
    KNOWN_GEM_TYPES,
    readExtraGems,
    readKnownGems,
    writeExtraGems,
    writeKnownGems,
  } from '../lib/gems'

  let tick = $state(0)

  let known = $derived.by(() => {
    void tick
    return store.data ? readKnownGems(store.data) : {}
  })

  let extras = $derived.by(() => {
    void tick
    return store.data ? readExtraGems(store.data) : {}
  })

  let knownText = $state<Record<string, string>>({})
  let extraText = $state<Record<string, string>>({})

  $effect(() => {
    void tick
    knownText = Object.fromEntries(
      Object.entries(known).map(([k, v]) => [k, String(v)]),
    )
  })

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

  function parseCount(raw: string): number | null {
    const cleaned = raw.replace(/,/g, '').trim()
    if (cleaned === '') return 0
    const n = Number.parseInt(cleaned, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  function commitKnown(type: string): void {
    const n = parseCount(knownText[type] ?? '')
    if (n === null) {
      knownText[type] = String(known[type] ?? 0)
      return
    }
    if (n === (known[type] ?? 0)) return
    refreshAfter(() => writeKnownGems(store.data!, { [type]: n }))
  }

  function commitExtra(key: string): void {
    const n = parseCount(extraText[key] ?? '')
    if (n === null) {
      extraText[key] = String(extras[key] ?? 0)
      return
    }
    if (n === (extras[key] ?? 0)) return
    refreshAfter(() => writeExtraGems(store.data!, { [key]: n }))
  }

  function fillAll(n: number): void {
    refreshAfter(() => {
      const edits: Record<string, number> = {}
      for (const t of KNOWN_GEM_TYPES) edits[t] = n
      writeKnownGems(store.data!, edits)
    })
  }

  function onCellKey(evt: KeyboardEvent): void {
    if (evt.key === 'Enter' || evt.key === 'Escape') {
      (evt.target as HTMLInputElement).blur()
    }
  }
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to edit gem counts.</p>
{:else}
  <section class="block">
    <p class="note">
      Type-gem counts (<code>save.gems.gemWallet</code>) in
      <code>PokemonType</code> enum order. Zero is a stored value here —
      positions are fixed, unlike the delete-at-0 trick used for shards.
    </p>
    <div class="grid">
      {#each KNOWN_GEM_TYPES as type (type)}
        <div class="cell">
          <label>
            <span class="type-name">{type}</span>
            <input
              type="text"
              inputmode="numeric"
              bind:value={knownText[type]}
              onblur={() => commitKnown(type)}
              onkeydown={(e) => onCellKey(e)}
            />
          </label>
        </div>
      {/each}
    </div>
    <div class="actions">
      <button type="button" onclick={() => fillAll(999)}>All to 999</button>
      <button type="button" onclick={() => fillAll(9999)}>All to 9999</button>
      <button type="button" onclick={() => fillAll(0)}>Zero all</button>
    </div>
  </section>

  {#if Object.keys(extras).length > 0}
    <section class="block">
      <h3>Additional type slots in this save</h3>
      <p class="note">
        Wallet entries past index 17 — a forward-compat handle for future
        PokeClicker types. Round-tripped verbatim; named by their array
        position.
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
    margin: 0 0 0.75rem;
    color: #666;
    font-size: 0.9em;
  }
  .note code {
    background: #eee;
    padding: 0 0.25rem;
    border-radius: 3px;
    font-size: 0.95em;
  }

  /* 4-col grid → 2-col on narrow viewports. With 18 types we get a tidy
     5-row block on wide screens; mobile gets 9 rows of 2. */
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem 0.75rem;
  }
  @media (max-width: 520px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .cell label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .type-name {
    color: #444;
    font-size: 0.85em;
  }
  .cell input,
  .extra-row input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font: inherit;
    text-align: right;
  }
  .cell input:focus,
  .extra-row input:focus {
    outline: 2px solid #2563eb;
    outline-offset: -1px;
  }

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
  .actions button:hover {
    background: #f0f0f0;
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
    color: #444;
    font-size: 0.85em;
    font-family: ui-monospace, monospace;
  }
</style>
