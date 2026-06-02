<script lang="ts">
  // Flutes tab — port of the Shards/Gems pattern, but flutes are
  // boolean owned/not-owned in the game (`FluteItem` declares
  // `{ maxAmount: 1 }`), so the UI uses checkboxes and writes 1 on
  // check / deletes the key on uncheck.
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
    KNOWN_FLUTES,
    readExtraFlutes,
    readKnownFlutes,
    writeExtraFlutes,
    writeKnownFlutes,
  } from '../lib/flutes'

  let tick = $state(0)

  let known = $derived.by(() => {
    void tick
    return store.data ? readKnownFlutes(store.data) : {}
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
    <ul class="grid">
      {#each KNOWN_FLUTES as name (name)}
        <li class="cell">
          <label>
            <input
              type="checkbox"
              checked={known[name] ?? false}
              onchange={(e) => toggleKnown(name, (e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="flute-name">{name} Flute</span>
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
    color: #333;
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
  .extra-row input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font: inherit;
    text-align: right;
  }
  .extra-row input:focus {
    outline: 2px solid #2563eb;
    outline-offset: -1px;
  }
</style>
