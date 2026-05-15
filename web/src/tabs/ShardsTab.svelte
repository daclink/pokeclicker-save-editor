<script lang="ts">
  // Shards tab — port of pcedit_gui.ShardsTab. 16 canonical colours in a
  // 4-col grid, bulk fill buttons, plus an "Other" panel for any *_shard
  // keys the save carries that aren't in the canonical list.
  //
  // Counts at 0 are deleted from player._itemList on commit (matches the
  // desktop tab and the game's "never persist zero counts" convention).
  // NumberField is too horizontally chunky for a 4-col grid, so the cells
  // inline their own compact input with the same commit-on-blur pattern.

  import { store } from '../lib/store.svelte'
  import {
    KNOWN_SHARD_COLORS,
    readExtraShards,
    readKnownShards,
    writeExtraShards,
    writeKnownShards,
  } from '../lib/shards'

  let tick = $state(0)

  let known = $derived.by(() => {
    void tick
    return store.data ? readKnownShards(store.data) : {}
  })

  let extras = $derived.by(() => {
    void tick
    return store.data ? readExtraShards(store.data) : {}
  })

  /** Text being edited, per cell. Synced from the source value via $effect
   *  whenever `tick` (or load) bumps `known`/`extras`. Per-cell so each
   *  cell's in-flight edits don't disturb its neighbours. */
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

  function commitKnown(color: string): void {
    const n = parseCount(knownText[color] ?? '')
    if (n === null) {
      // Snap back if invalid.
      knownText[color] = String(known[color] ?? 0)
      return
    }
    if (n === (known[color] ?? 0)) return // no-op
    refreshAfter(() => writeKnownShards(store.data!, { [color]: n }))
  }

  function commitExtra(key: string): void {
    const n = parseCount(extraText[key] ?? '')
    if (n === null) {
      extraText[key] = String(extras[key] ?? 0)
      return
    }
    if (n === (extras[key] ?? 0)) return
    refreshAfter(() => writeExtraShards(store.data!, { [key]: n }))
  }

  function fillAll(n: number): void {
    refreshAfter(() => {
      const edits: Record<string, number> = {}
      for (const c of KNOWN_SHARD_COLORS) edits[c] = n
      writeKnownShards(store.data!, edits)
    })
  }

  function onCellKey(evt: KeyboardEvent, commit: () => void): void {
    if (evt.key === 'Enter') (evt.target as HTMLInputElement).blur()
    else if (evt.key === 'Escape') (evt.target as HTMLInputElement).blur()
  }
</script>

{#if store.data === null}
  <p class="empty">Load a save with <strong>Browse…</strong> above to edit shard counts.</p>
{:else}
  <section class="block">
    <p class="note">
      Shard counts (<code>player._itemList.&lt;Color&gt;_shard</code>). Editing
      a colour you haven't unlocked yet is fine — it appears once you reach
      the right region. Counts at 0 are dropped from the save instead of
      being written.
    </p>
    <div class="grid">
      {#each KNOWN_SHARD_COLORS as color (color)}
        <div class="cell">
          <label>
            <span class="color">{color}</span>
            <input
              type="text"
              inputmode="numeric"
              bind:value={knownText[color]}
              onblur={() => commitKnown(color)}
              onkeydown={(e) => onCellKey(e, () => commitKnown(color))}
            />
          </label>
        </div>
      {/each}
    </div>
    <div class="actions">
      <button type="button" onclick={() => fillAll(999)}>All known to 999</button>
      <button type="button" onclick={() => fillAll(9999)}>All known to 9999</button>
      <button type="button" onclick={() => fillAll(0)}>Zero all</button>
    </div>
  </section>

  {#if Object.keys(extras).length > 0}
    <section class="block">
      <h3>Other shard items in this save</h3>
      <p class="note">
        Any <code>*_shard</code> entries in <code>_itemList</code> the editor
        doesn't predeclare. Same delete-at-0 rule.
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
              onkeydown={(e) => onCellKey(e, () => commitExtra(key))}
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

  /* 4-col grid, wraps to 2 on narrow viewports. */
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
  .color {
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
